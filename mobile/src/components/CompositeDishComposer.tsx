import { useEffect, useRef, useState, type RefObject } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Reanimated, { useSharedValue, type SharedValue } from "react-native-reanimated";
import type { MenuItem } from "@udine/shared";
import { HoldSlideHost, type HoldSlideHostHandle } from "./HoldSlideOverlay";
import { PlateAddControl } from "./PlateAddControl";
import { formatServingSummary } from "../lib/hallMenuTabs";
import { sumComposedNutrition, type CompositeAddInSelection, type CompositeRecipe } from "../lib/plate";
import { useDraggableSheet } from "../lib/sheetAnimation";
import { MIN_DRAG_SERVINGS } from "../lib/servingsStepper";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  /** Null while nothing has ever been targeted (before the first open) -- see [slug].tsx's
   * composerTarget doc for why base/addIns stay set (stale) through the close animation rather
   * than being nulled the instant `visible` flips false. */
  base: MenuItem | null;
  addIns: MenuItem[];
  /** Seeds this session's selections when the sheet opens -- non-null for "Edit add-ins" on an
   * already-composed dish, null for a fresh not-yet-composed dish. */
  initialRecipe: CompositeRecipe | null;
  onClose: () => void;
  onAddToPlate: (base: MenuItem, recipe: CompositeRecipe) => void;
  onShowFullNutritionLabel: (item: MenuItem) => void;
}

// fs(640), not a bare literal -- same panel-travel convention PlateSheet's own useDraggableSheet
// call uses (its third argument), so the composer's drag-to-dismiss distance scales with the
// device the same way.
const SHEET_TRAVEL = fs(640);

/** One add-in row (CompositeDishComposer.dc.html:43-97) -- a real catalog dish with its own
 * cal/protein line and its own pre-add/in-plate hold-drag control (composite-dish-logic
 * annotation: "an add-in ... has a well-defined '1 unit' from the start", unlike the parent
 * composite dish). Expands to per-serving macros + diet tags + a Full Nutrition Label link, same
 * treatment as any HallMenu dish row's expanded content. */
function AddInRow({
  item,
  count,
  expanded,
  onToggleExpand,
  onStep,
  onQuickAdd,
  onHoldStart,
  onHoldDrag,
  onHoldEnd,
  liveCount,
  liveIndex,
  blocksScrollRefs,
  onShowFullNutritionLabel,
}: {
  item: MenuItem;
  count: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onStep: (delta: number) => void;
  onQuickAdd: () => void;
  onHoldStart: (anchor: { x: number; y: number; width: number; height: number }) => void;
  onHoldDrag: (count: number) => void;
  onHoldEnd: () => void;
  liveCount: SharedValue<number>;
  liveIndex: SharedValue<number>;
  blocksScrollRefs: RefObject<any>[];
  onShowFullNutritionLabel: (item: MenuItem) => void;
}) {
  const selected = count > 0;
  return (
    <View style={[styles.addInRow, selected ? styles.addInRowSelected : styles.addInRowUnselected]}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${item.dishName}`}
      />
      <View style={styles.addInMainLine} pointerEvents="box-none">
        <View style={styles.addInInfo} pointerEvents="none">
          <Text style={styles.addInName}>{item.dishName}</Text>
          <Text style={styles.addInMeta}>
            {Math.round(item.nutrition.calories)} cal · {Math.round(item.nutrition.proteinG)}g protein
          </Text>
        </View>
        <PlateAddControl
          plateEntry={selected ? { count } : undefined}
          item={item}
          onStep={onStep}
          blocksScrollRefs={blocksScrollRefs}
          onQuickAdd={onQuickAdd}
          onHoldStart={onHoldStart}
          onHoldDrag={onHoldDrag}
          onHoldEnd={onHoldEnd}
          liveCount={liveCount}
          liveIndex={liveIndex}
        />
      </View>
      {expanded && (
        <View style={styles.addInExpanded} pointerEvents="box-none">
          <View style={styles.addInDivider} pointerEvents="none" />
          <Text style={styles.addInServingSummary} pointerEvents="none">
            {formatServingSummary(item.nutrition)}
          </Text>
          {item.dietTags.length > 0 && (
            <View style={styles.dietChipRow} pointerEvents="none">
              {item.dietTags.map((tag) => (
                <View key={tag} style={styles.dietChip}>
                  <Text style={styles.dietChipText}>{tag.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          )}
          <Pressable
            onPress={() => onShowFullNutritionLabel(item)}
            hitSlop={8}
            style={styles.fullLabelLink}
            accessibilityRole="button"
            accessibilityLabel={`Full nutrition label for ${item.dishName}`}
          >
            <Text style={styles.fullLabelLinkText}>FULL NUTRITION LABEL ›</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Bowl composer sheet (CompositeDishComposer.dc.html) -- opened from a composite dish's
 * not-yet-composed row (bowl button) or its composed row's "Edit add-ins" link. Stays mounted
 * across open/close (only `visible` toggles, same as PlateSheet/CafeSheet/FilterSheet) so
 * useDraggableSheet's JS-driven close animation (durations.sheet, 300ms) has something to render
 * through its full length. Selections live entirely in this component's own state -- session-only,
 * never persisted -- and are folded into one PlateEntry by the caller's onAddToPlate
 * (foldRecipeToPlateEntry in lib/plate.ts) on "Add to Plate".
 */
export function CompositeDishComposer({ visible, base, addIns, initialRecipe, onClose, onAddToPlate, onShowFullNutritionLabel }: Props) {
  const { gesture, backdropStyle, panelStyle, modalVisible } = useDraggableSheet(visible, onClose, SHEET_TRAVEL);
  const [selections, setSelections] = useState<Map<string, number>>(new Map());
  const [expandedAddIn, setExpandedAddIn] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Re-seeds from initialRecipe every time the sheet opens (never mid-session) -- reopening after
  // a close always starts from the caller's own idea of "what's currently saved", same as
  // PlateSheet's own initialQuery effect (keyed on [visible, initialQuery]) re-seeding its search
  // box only on the visible-flip, not on every initialQuery identity change while already open.
  useEffect(() => {
    if (!visible) return;
    setSelections(new Map((initialRecipe?.addIns ?? []).map((a) => [a.item.dishName, a.count])));
    setExpandedAddIn(null);
    // initialRecipe deliberately NOT listed -- see comment above: intentionally NOT re-seeding on
    // every initialRecipe identity change while the sheet stays open, only on the visible-flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const liveHoldCount = useSharedValue(MIN_DRAG_SERVINGS);
  const liveHoldIndex = useSharedValue(0);
  const holdSlideHostRef = useRef<HoldSlideHostHandle>(null);
  const dragStateRef = useRef<{ item: MenuItem } | null>(null);

  function setAddInCount(item: MenuItem, count: number) {
    setSelections((prev) => {
      const next = new Map(prev);
      if (count <= 0) next.delete(item.dishName);
      else next.set(item.dishName, count);
      return next;
    });
  }

  const selectedAddIns: CompositeAddInSelection[] = addIns
    .map((item) => ({ item, count: selections.get(item.dishName) ?? 0 }))
    .filter((a) => a.count > 0);
  // Recomputed fresh on every render (selections just changed) -- never cached across steps, per
  // the acceptance criterion ("recomputed on every step").
  const totals = base ? sumComposedNutrition(base.nutrition, selectedAddIns) : null;

  return (
    <Modal visible={modalVisible} transparent animationType="none" onRequestClose={onClose}>
      {/* A root-level GestureHandlerRootView doesn't reliably propagate into a Modal's separate
      native host/window (same as PlateSheet's own comment), so this sheet nests its own. */}
      <GestureHandlerRootView style={styles.backdrop}>
        <Reanimated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
          <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
        </Reanimated.View>
        <Reanimated.View style={[styles.sheet, panelStyle]}>
          <GestureDetector gesture={gesture}>
            <View style={styles.handleRowGesture}>
              <View style={styles.handle} />
            </View>
          </GestureDetector>
          {base && (
            <ScrollView ref={scrollRef} style={styles.scroll} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <Text style={styles.title}>{base.dishName}</Text>
                <Text style={styles.baseMeta}>
                  base · {Math.round(base.nutrition.calories)} cal · {Math.round(base.nutrition.proteinG)}g protein
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Add-ins</Text>

              {addIns.map((item) => (
                <AddInRow
                  key={item.dishName}
                  item={item}
                  count={selections.get(item.dishName) ?? 0}
                  expanded={expandedAddIn === item.dishName}
                  onToggleExpand={() => setExpandedAddIn((prev) => (prev === item.dishName ? null : item.dishName))}
                  onStep={(delta) => setAddInCount(item, (selections.get(item.dishName) ?? 0) + delta)}
                  onQuickAdd={() => setAddInCount(item, 1)}
                  onHoldStart={(anchor) => {
                    dragStateRef.current = { item };
                    holdSlideHostRef.current?.open(anchor);
                  }}
                  onHoldDrag={(count) => holdSlideHostRef.current?.updateCount(count)}
                  onHoldEnd={() => {
                    // 0 is the drag's cancel rung (CANCEL_SERVINGS), never a real add.
                    if (dragStateRef.current && liveHoldCount.value > 0) {
                      setAddInCount(dragStateRef.current.item, liveHoldCount.value);
                    }
                    dragStateRef.current = null;
                    holdSlideHostRef.current?.close();
                  }}
                  liveCount={liveHoldCount}
                  liveIndex={liveHoldIndex}
                  blocksScrollRefs={[scrollRef]}
                  onShowFullNutritionLabel={onShowFullNutritionLabel}
                />
              ))}

              <View style={styles.divider} />

              {totals && (
                <View style={styles.totalsRow}>
                  <Stat label="Cal" value={String(Math.round(totals.calories))} />
                  <Stat label="Protein" value={`${Math.round(totals.proteinG)}g`} />
                  <Stat label="Carbs" value={`${Math.round(totals.totalCarbG)}g`} />
                  <Stat label="Fat" value={`${Math.round(totals.totalFatG)}g`} />
                </View>
              )}

              <Pressable
                style={styles.addToPlateButton}
                onPress={() => base && onAddToPlate(base, { addIns: selectedAddIns })}
                accessibilityRole="button"
                accessibilityLabel="Add to Plate"
              >
                <Text style={styles.addToPlateButtonText}>Add to Plate</Text>
              </Pressable>
            </ScrollView>
          )}
        </Reanimated.View>
      </GestureHandlerRootView>
      <HoldSlideHost ref={holdSlideHostRef} liveIndex={liveHoldIndex} />
    </Modal>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: withOpacity(colors.ink900, 50) },
  sheet: {
    backgroundColor: colors.paper50,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: SHEET_TRAVEL,
    // CompositeDishComposer.dc.html:23 -- box-shadow: 0 -8px 24px rgba(36,26,20,0.25).
    shadowColor: colors.ink900,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 8,
  },
  handleRowGesture: { alignItems: "center", paddingVertical: spacing(2.5) },
  handle: { width: 40, height: 4, borderRadius: radii.pill, backgroundColor: withOpacity(colors.ink900, 20) },
  scroll: { paddingHorizontal: spacing(5) },
  header: { gap: 2, paddingBottom: spacing(2) },
  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
  baseMeta: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 55) },
  sectionLabel: { fontFamily: fonts.display600, fontSize: fs(11), letterSpacing: 1.2, textTransform: "uppercase", color: withOpacity(colors.ink900, 50), marginTop: 2, marginBottom: spacing(2) },

  addInRow: { borderRadius: radii.md, marginBottom: spacing(2.5), padding: spacing(3) },
  addInRowSelected: { backgroundColor: colors.paper50, borderWidth: 1, borderColor: colors.gold500 },
  addInRowUnselected: { backgroundColor: colors.paper50, borderWidth: 1, borderColor: withOpacity(colors.ink900, 12) },
  addInMainLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(2.5) },
  addInInfo: { flexShrink: 1, gap: 1 },
  addInName: { fontFamily: fonts.body600, fontSize: fs(14), color: colors.ink900 },
  addInMeta: { fontFamily: fonts.mono, fontSize: fs(12), color: withOpacity(colors.ink900, 60) },
  addInExpanded: { gap: spacing(2.5), marginTop: spacing(2.5) },
  addInDivider: { height: 1, backgroundColor: withOpacity(colors.ink900, 10) },
  addInServingSummary: { fontFamily: fonts.mono, fontSize: fs(11), color: withOpacity(colors.ink900, 70) },

  dietChipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(1.5) },
  dietChip: { borderWidth: 1, borderColor: withOpacity(colors.ink900, 20), borderRadius: radii.pill, paddingVertical: 2, paddingHorizontal: spacing(2) },
  dietChipText: { fontFamily: fonts.body600, fontSize: fs(9), letterSpacing: 0.4, color: colors.maroon900 },
  fullLabelLink: { flexDirection: "row", alignItems: "center", gap: spacing(1), minHeight: 44 },
  fullLabelLinkText: { fontFamily: fonts.body600, fontSize: fs(10), letterSpacing: 0.4, color: colors.maroon600 },

  divider: { height: 1, backgroundColor: withOpacity(colors.ink900, 10), marginTop: spacing(0.5), marginBottom: spacing(2) },
  totalsRow: { flexDirection: "row" },
  statCell: { flex: 1, alignItems: "center", gap: 1 },
  statValue: { fontFamily: fonts.mono, fontWeight: "700", fontSize: fs(15), color: colors.maroon900 },
  statLabel: { fontSize: fs(9), letterSpacing: 0.5, textTransform: "uppercase", color: withOpacity(colors.ink900, 50) },

  addToPlateButton: {
    backgroundColor: colors.gold500,
    borderRadius: radii.md,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing(3),
    marginBottom: spacing(6),
  },
  addToPlateButtonText: { fontFamily: fonts.display600, fontSize: fs(15), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900 },
});
