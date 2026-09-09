import type { CustomFood, CustomFoodsStorage } from "@udine/shared";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildCustomFood, hasRequiredCoreMacros, type CustomFoodFormInput } from "../lib/customFoodForm";
import { Button } from "./ui";
import { colors, fonts, fs, radii, spacing, withOpacity } from "../lib/theme";

interface Props {
  visible: boolean;
  /** Prefills the name field with whatever was typed in PlateSheet's search box when the standing
   * "Can't find it? Create a custom food" row was tapped -- see PlateSheet.tsx's own doc on that
   * row. Undefined when opened with nothing typed. */
  initialName?: string;
  customFoodsStorage: CustomFoodsStorage;
  onSaved: (food: CustomFood) => void;
  onClose: () => void;
}

const BLANK: CustomFoodFormInput = {
  name: "",
  servingSize: "",
  calories: "",
  proteinG: "",
  totalCarbG: "",
  totalFatG: "",
  caloriesFromFat: "",
  satFatG: "",
  transFatG: "",
  cholesterolMg: "",
  sodiumMg: "",
  dietaryFiberG: "",
  sugarsG: "",
  ingredients: "",
};

/**
 * Manual custom-food entry (#91 follow-on, greenfield -- no database will ever have a homemade
 * recipe or a friend's cooking). Device-local only, always: saved straight to
 * CustomFoodsStorage/custom_foods, never touches Supabase, same residency posture as
 * CustomFood's own doc comment. Core 4 macros (calories/protein/carbs/fat) required up front;
 * everything else NutritionFacts has lives behind "More nutrition fields" so a quick entry isn't
 * blocked on fiber/sugar/sodium/etc. Same RN <Modal> structural call as NutritionLabel/PlateSheet
 * (see halls/[slug].tsx's own note) -- rendered as a sibling, not nested inside PlateSheet's Modal.
 */
export function CustomFoodForm({ visible, initialName, customFoodsStorage, onSaved, onClose }: Props) {
  const [fields, setFields] = useState<CustomFoodFormInput>(BLANK);
  const [showMore, setShowMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const insets = useSafeAreaInsets();

  // Reseed on every open (not just mount) -- matches PlateSheet's own close-effect reset
  // convention: a form left open across an unrelated re-render shouldn't retain a previous
  // attempt's half-typed values, and initialName can differ each time this opens.
  useEffect(() => {
    if (visible) {
      setFields({ ...BLANK, name: initialName ?? "" });
      setShowMore(false);
      setError(null);
    }
  }, [visible, initialName]);

  function set<K extends keyof CustomFoodFormInput>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  const coreMacrosFilled = hasRequiredCoreMacros(fields);

  async function handleSave() {
    // Belt-and-suspenders on top of the Save button's own `disabled` below -- if it's ever
    // wrong/stale, this still stops the save rather than silently shipping a 0-macro entry.
    if (!coreMacrosFilled) {
      setError("Calories, protein, carbs, and fat are required.");
      return;
    }
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const food = buildCustomFood(fields, id);
    if (!food) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      await customFoodsStorage.addCustomFood(food);
      onSaved(food);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.screen}>
        <View style={[styles.header, { paddingTop: insets.top + spacing(4.5) }]}>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={styles.backChevron}>‹</Text>
          </Pressable>
          <Text style={styles.title}>New Custom Food</Text>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Field label="Name" value={fields.name} onChangeText={(v) => set("name", v)} placeholder="e.g. Grandma's Lasagna" emphasized />
          <Field label="Serving size" value={fields.servingSize} onChangeText={(v) => set("servingSize", v)} placeholder="e.g. 1 slice" />

          <View style={styles.macroGrid}>
            <View style={styles.macroRow}>
              <MacroField label="Calories" value={fields.calories} onChangeText={(v) => set("calories", v)} style={styles.macroCell} />
              <MacroField label="Protein (g)" value={fields.proteinG} onChangeText={(v) => set("proteinG", v)} style={styles.macroCell} />
            </View>
            <View style={styles.macroRow}>
              <MacroField label="Carbs (g)" value={fields.totalCarbG} onChangeText={(v) => set("totalCarbG", v)} style={styles.macroCell} />
              <MacroField label="Fat (g)" value={fields.totalFatG} onChangeText={(v) => set("totalFatG", v)} style={styles.macroCell} />
            </View>
          </View>

          <Pressable onPress={() => setShowMore((s) => !s)} accessibilityRole="button" style={styles.moreToggle}>
            <Text style={styles.moreToggleText}>{showMore ? "Hide" : "More"} nutrition fields</Text>
            <Text style={styles.moreToggleChevron}>⌄</Text>
          </Pressable>

          {showMore && (
            <View style={styles.moreFields}>
              <View style={styles.row}>
                <Field label="Sat. fat (g)" value={fields.satFatG ?? ""} onChangeText={(v) => set("satFatG", v)} keyboardType="decimal-pad" style={styles.rowField} />
                <Field label="Trans fat (g)" value={fields.transFatG ?? ""} onChangeText={(v) => set("transFatG", v)} keyboardType="decimal-pad" style={styles.rowField} />
              </View>
              <View style={styles.row}>
                <Field label="Cholesterol (mg)" value={fields.cholesterolMg ?? ""} onChangeText={(v) => set("cholesterolMg", v)} keyboardType="decimal-pad" style={styles.rowField} />
                <Field label="Sodium (mg)" value={fields.sodiumMg ?? ""} onChangeText={(v) => set("sodiumMg", v)} keyboardType="decimal-pad" style={styles.rowField} />
              </View>
              <View style={styles.row}>
                <Field label="Fiber (g)" value={fields.dietaryFiberG ?? ""} onChangeText={(v) => set("dietaryFiberG", v)} keyboardType="decimal-pad" style={styles.rowField} />
                <Field label="Sugars (g)" value={fields.sugarsG ?? ""} onChangeText={(v) => set("sugarsG", v)} keyboardType="decimal-pad" style={styles.rowField} />
              </View>
              <Field label="Calories from fat" value={fields.caloriesFromFat ?? ""} onChangeText={(v) => set("caloriesFromFat", v)} keyboardType="decimal-pad" />
              <Field label="Ingredients" value={fields.ingredients ?? ""} onChangeText={(v) => set("ingredients", v)} placeholder="Optional" multiline />
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: spacing(3) + insets.bottom }]}>
          <Button
            variant="primary"
            style={styles.saveButton}
            textStyle={styles.saveButtonText}
            onPress={handleSave}
            disabled={saving || !fields.name.trim() || !coreMacrosFilled}
          >
            {saving ? "Saving…" : "Save Custom Food"}
          </Button>
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  style,
  emphasized,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "decimal-pad";
  multiline?: boolean;
  style?: object;
  /** Name field only (CustomFoodForm.dc.html line 27) -- gold border + bold value text,
   * distinguishing it from every other (non-emphasized, 20%-opacity-border) field. */
  emphasized?: boolean;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMultiline, emphasized && styles.fieldInputEmphasized]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={withOpacity(colors.ink900, 45)}
        keyboardType={keyboardType}
        multiline={multiline}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** Per-serving core macro cells (2x2 grid, CustomFoodForm.dc.html lines 41-58) -- distinct from
 * Field: bordered card, small uppercase label, monospace value. */
function MacroField({
  label,
  value,
  onChangeText,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  style?: object;
}) {
  return (
    <View style={[styles.macroField, style]}>
      <Text style={styles.macroFieldLabel}>{label}</Text>
      <TextInput
        style={styles.macroFieldInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholderTextColor={withOpacity(colors.ink900, 45)}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream100 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingHorizontal: spacing(5), paddingBottom: spacing(3) },
  backChevron: { fontFamily: fonts.body400, fontSize: fs(32), lineHeight: fs(34), color: colors.maroon900, marginTop: -4 },
  title: { fontFamily: fonts.display700, fontSize: fs(20), letterSpacing: 1, textTransform: "uppercase", color: colors.maroon900, flex: 1 },

  body: { paddingHorizontal: spacing(5), paddingBottom: spacing(6), gap: spacing(3) },
  row: { flexDirection: "row", gap: spacing(3) },
  rowField: { flex: 1 },

  field: { gap: spacing(1) },
  // CustomFoodForm.dc.html line 26 (non-emphasized field label): 11px/600/1px-letterspacing/uppercase/55%.
  fieldLabel: { fontFamily: fonts.body600, fontSize: fs(11), letterSpacing: 1, textTransform: "uppercase", color: withOpacity(colors.ink900, 55) },
  fieldInput: {
    borderWidth: 1,
    // Line 33/42/46/50/54: non-emphasized fields use a 20%-opacity border.
    borderColor: withOpacity(colors.ink900, 20),
    borderRadius: radii.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    fontFamily: fonts.body400,
    color: colors.ink900,
  },
  fieldInputMultiline: { minHeight: fs(72), textAlignVertical: "top" },
  // Line 27: Name field only -- 1.5px solid gold border + bold value text.
  fieldInputEmphasized: { borderWidth: 1.5, borderColor: colors.gold500, fontFamily: fonts.body600 },

  macroGrid: { gap: spacing(2.5) },
  macroRow: { flexDirection: "row", gap: spacing(2.5) },
  macroCell: { flex: 1 },
  macroField: { borderWidth: 1, borderColor: withOpacity(colors.ink900, 20), borderRadius: radii.md, paddingHorizontal: spacing(3), paddingVertical: spacing(2.5), gap: 2 },
  macroFieldLabel: { fontFamily: fonts.body600, fontSize: fs(10), letterSpacing: 0.8, textTransform: "uppercase", color: withOpacity(colors.ink900, 50) },
  macroFieldInput: { fontFamily: fonts.mono, fontSize: fs(16), fontWeight: "600", color: colors.ink900, padding: 0 },

  moreToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: withOpacity(colors.ink900, 15),
    borderRadius: radii.md,
    paddingVertical: spacing(2.75),
    paddingHorizontal: spacing(3.5),
  },
  moreToggleText: { fontFamily: fonts.body600, fontSize: fs(13), color: colors.maroon900 },
  moreToggleChevron: { fontFamily: fonts.body600, fontSize: fs(12), color: colors.maroon600 },
  moreFields: { gap: spacing(3) },

  error: { fontFamily: fonts.body400, fontSize: fs(13), color: "#b00020" },

  footer: { backgroundColor: colors.paper50, borderTopWidth: 1, borderColor: withOpacity(colors.ink900, 12), paddingHorizontal: spacing(5), paddingTop: spacing(3) },
  saveButton: { height: fs(50), borderRadius: radii.md, backgroundColor: colors.maroon900 },
  saveButtonText: { fontFamily: fonts.display600, fontSize: fs(15), letterSpacing: 1, textTransform: "uppercase", fontWeight: "400" },
});
