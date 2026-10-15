import 'package:flutter/widgets.dart';

import '../../core/m2/history.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// `.sec h2`: a section's heading.
class SecHead extends StatelessWidget {
  const SecHead(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: M2Layout.secHeadBottom),
        child: Semantics(header: true, child: Text(text, style: M2Text.section.style(M2Color.dm))),
      );
}

/// `.lrow .mc`: the figure, "cal" and the chevron.
class CalTrailing extends StatelessWidget {
  const CalTrailing(this.cal, {super.key});
  final num cal;
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Text(fc(cal), style: M2Layout.mealCalNum.style(M2Color.ink)),
        const SizedBox(width: M2Layout.mealCalGap),
        Text('cal', style: M2Text.meta.style(M2Color.slate)),
        const SizedBox(width: M2Layout.mealCalGap),
        const Chevron(),
      ]);
}

/// `.lgone`: the inline "Removed ..." row that takes the place of an item taken off a meal, with its Undo.
class GoneRow extends StatelessWidget {
  const GoneRow({super.key, required this.name, required this.onUndo});
  final String name;
  final VoidCallback onUndo;
  @override
  Widget build(BuildContext context) => Container(
        constraints: const BoxConstraints(minHeight: M2Layout.lgoneMin),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
        child: Row(children: [
          Expanded(child: Text('Removed $name', style: M2Layout.lgoneName.style(M2Color.slate))),
          const SizedBox(width: M2Layout.lgoneGap),
          TextAction('Undo', onTap: onUndo),
        ]),
      );
}

/// One day's totals and its meals (M2 `dayBlock`): `title` ("Today") over the totals box, then Meals, each a row that opens the meal.
class DayBlock extends StatelessWidget {
  const DayBlock({super.key, required this.meals, required this.day, required this.title, required this.onMeal, required this.titleOf, this.inset = M2Space.gutter});
  final List<LoggedMeal> meals;
  final String day;
  final String? title;
  final void Function(LoggedMeal) onMeal;
  final String Function(LoggedMeal) titleOf;
  final double inset;

  @override
  Widget build(BuildContext context) {
    final t = dayTotal(meals, day), ms = [for (final m in meals) if (m.day == day) m];
    return Padding(
      padding: EdgeInsets.symmetric(horizontal: inset),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.only(top: M2Layout.todayTop),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            if (title != null) SecHead(title!),
            Facts(cal: t.cal, p: t.p, c: t.c, f: t.f),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.only(top: M2Layout.secTop),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            const SecHead('Meals'),
            if (ms.isEmpty)
              Padding(padding: const EdgeInsets.only(top: M2Layout.kvTop), child: Text('Nothing logged yet today.', style: M2Text.sched.style(M2Color.slate)))
            else
              for (final (i, m) in ms.indexed) LRow(title: titleOf(m), subtitle: m.time, trailing: CalTrailing(m.total.cal), last: i == ms.length - 1, onTap: () => onMeal(m)),
          ]),
        ),
      ]),
    );
  }
}
