import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

const _label = Label('1 thigh (6 oz)', '240', [
  LabelRow(LabelKind.thin, '', '', '', '% Daily Value*'),
  LabelRow(LabelKind.row, 'Total Fat 11g', 'Total Fat', '11g', '14%'),
  LabelRow(LabelKind.sub, 'Saturated Fat 3g', 'Saturated Fat', '3g', '15%'),
  LabelRow(LabelKind.row, 'Protein 28g', 'Protein', '28g', '56%', last: true),
]);

void _no() {}

/// Every kit widget on one scrolling page: the first subject of `app/tool/screenshot.sh /kit`. Debug and profile builds only.
class KitGallery extends StatelessWidget {
  const KitGallery({super.key});

  @override
  Widget build(BuildContext context) {

    const gap = SizedBox(height: M2Space.group);
    Widget row(List<Widget> c) => Wrap(spacing: M2Space.panel, runSpacing: M2Space.panel, crossAxisAlignment: WrapCrossAlignment.center, children: c);
    return ColoredBox(
      color: M2Color.chalk,
      child: SingleChildScrollView(
        child: DefaultTextStyle(
          style: M2Text.rowName.style(M2Color.ink),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const ScreenHeader.title(top: M2Space.group, title: 'UDine', date: 'Thursday, October 8'),
            ScreenHeader.page(top: M2Space.group, title: 'Kit', onBack: _no),
            const Band(name: 'Worcester', status: 'Open until 2:30 PM', busy: BusyRow(lamps: 3, word: 'Busy'), letter: HallLetter(letter: 'W', x: M2Space.group)),
            const Band(name: 'Franklin', status: 'Closed', compact: true),
            const ColoredBox(color: M2Color.dm, child: Padding(padding: EdgeInsets.all(M2Space.gutter), child: Button(kind: ButtonKind.outline, label: 'Directions'))),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter, vertical: M2Space.group),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Button(kind: ButtonKind.primary, label: 'Add to plate', expand: true),
                const SizedBox(height: M2Space.part),
                const Button(kind: ButtonKind.line, label: 'Cancel', expand: true),
                gap,
                row([
                  const Button(kind: ButtonKind.gold, label: 'Log'),
                  const Button(kind: ButtonKind.outlineDark, label: 'Directions'),
                  const Button(kind: ButtonKind.directions, label: 'Directions'),
                  const TextAction('Show all', onTap: _no),
                ]),
                gap,
                row([
                  const Stepper(qty: 1.5, onDec: _no, onInc: _no),
                  const AddButton(onTap: _no),
                  const AddButton(ghost: true),
                  const PlusMinus(plus: true),
                  const PlusMinus(plus: false),
                  RowControl(qty: 1, ghost: false, onAdd: _no, onInc: _no, onDec: _no),
                ]),
                gap,
                row([
                  const ScoreBadge(kind: ScoreKind.health, value: 6),
                  const ScoreBadge(kind: ScoreKind.carbon, value: 'B', size: ScoreSize.sheet),
                  const Badge(Glyph.plant, label: 'Plant-based'),
                  const MarkPatch(Glyph.halal, 'Halal'),
                  const MarkGlyph(Glyph.local, color: M2Color.vm, size: M2Layout.chevron),
                  const HallChip(letter: 'W', name: 'Worcester'),
                  const Meter(lit: 2),
                  const Chevron(),
                  const Spinner(),
                  const Felt(width: M2Space.group, height: M2Space.group),
                  BackButton(onTap: _no),
                  const FilterChipButton(label: 'Open now', selected: false),
                  const FilterChipButton(label: 'Open now', selected: true),
                  const ColoredBox(color: M2Color.vm, child: Row(mainAxisSize: MainAxisSize.min, children: [PinButton(pinned: false), PinButton(pinned: true)])),
                ]),
              ]),
            ),
            ListRow(name: const TextSpan(text: 'Golden BBQ Chicken Thigh'), label: 'Golden BBQ Chicken Thigh', meta: const Text('240 cal'), control: const AddButton()),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
              child: Column(children: [
                const LRow(title: 'Dietary preferences', subtitle: 'None'),
                const LRow(leading: Thumb(), title: 'Wasabi', subtitle: 'Blue Wall, Campus Center', trailing: Text('Open until 9 PM')),
                CheckRow(label: 'Vegetarian', on: true, onChanged: (_) {}),
                CheckRow(label: 'Halal', on: false, onChanged: (_) {}, last: true),
              ]),
            ),
            SheetOption(label: 'Soups', trailing: '12', current: true, onTap: _no),
            SheetOption(label: 'Entrées', trailing: '8', current: false, onTap: _no),
            const Padding(padding: EdgeInsets.all(M2Space.gutter), child: Arrive(child: Facts(cal: 240, p: 28, c: 9, f: 11))),
            const SheetGrab(),
            const Padding(padding: EdgeInsets.all(M2Space.gutter), child: RatingsPanel(health: 6, carbon: 'B')),
            const Padding(padding: EdgeInsets.symmetric(horizontal: M2Space.gutter), child: NutritionLabel(label: _label)),
            gap,
            M2TabBar(selected: 0, onSelect: (_) {}),
          ]),
        ),
      ),
    );
  }
}
