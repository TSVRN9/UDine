import 'package:flutter/widgets.dart';

import '../../core/m2/history.dart';
import '../../core/m2/menu_view.dart' show allergens;
import '../../shell/app_scope.dart';
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
  final num? cal;
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
  const DayBlock({super.key, required this.meals, required this.day, required this.title, required this.onMeal, required this.titleOf});
  final List<LoggedMeal> meals;
  final String day;
  final String? title;
  final void Function(LoggedMeal) onMeal;
  final String Function(LoggedMeal) titleOf;

  @override
  Widget build(BuildContext context) {
    final t = dayTotal(meals, day), ms = [for (final m in meals) if (m.day == day) m];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
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

/// `checkRow('track')`: Track what I eat, the one setting that changes the app's shape. On You and in the first-run sheet alike.
class TrackRow extends StatelessWidget {
  const TrackRow({super.key, this.last = false});
  final bool last;
  @override
  Widget build(BuildContext context) {
    final prefs = AppScope.of(context).prefs;
    return ListenableBuilder(listenable: prefs, builder: (_, _) => CheckRow(label: 'Track what I eat', line: 'Calories, protein, carbs and fat', on: prefs.track, last: last, onChanged: (v) { Haptics.selection(); prefs.setTrack(v); }));
  }
}

/// "Only show" (`dietRows`): Vegetarian, Plant based, Halal, each written as the feed spells it.
class OnlyShowRows extends StatelessWidget {
  const OnlyShowRows({super.key});
  static const _only = [('Vegetarian', 'Vegetarian'), ('Plant Based', 'Plant based'), ('Halal', 'Halal')];
  @override
  Widget build(BuildContext context) {
    final prefs = AppScope.of(context).prefs;
    return ListenableBuilder(
      listenable: prefs,
      builder: (_, _) {
        final d = prefs.diet, on = {'Vegetarian': d.veg, 'Plant Based': d.plant, 'Halal': d.halal};
        return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (final (tag, label) in _only) CheckRow(label: label, on: on[tag]!, onChanged: (v) { Haptics.selection(); prefs.setOnlyShow(tag, v); }),
        ]);
      },
    );
  }
}

/// "Avoid": the 11 allergens in round 9's order.
class AvoidRows extends StatelessWidget {
  const AvoidRows({super.key, this.last = true});
  final bool last;
  @override
  Widget build(BuildContext context) {
    final prefs = AppScope.of(context).prefs;
    return ListenableBuilder(
      listenable: prefs,
      builder: (_, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        for (final (i, a) in allergens.indexed)
          CheckRow(label: a[0] + a.substring(1).toLowerCase(), on: prefs.diet.avoid.contains(a), last: last && i == allergens.length - 1, onChanged: (_) { Haptics.selection(); prefs.toggleAvoid(a); }),
      ]),
    );
  }
}

/// "Show on dishes" (`showRows`): the score toggles, each leading with the tile it turns on.
class ShowRows extends StatelessWidget {
  const ShowRows({super.key});
  @override
  Widget build(BuildContext context) {
    final prefs = AppScope.of(context).prefs;
    return ListenableBuilder(
      listenable: prefs,
      builder: (_, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        CheckRow(label: 'Healthfulness', lead: const ScoreBadge(kind: ScoreKind.health, value: 5, size: ScoreSize.sheet), on: prefs.scores.health, onChanged: (v) { Haptics.selection(); prefs.setScore(health: v); }),
        CheckRow(label: 'Carbon rating', lead: const ScoreBadge(kind: ScoreKind.carbon, value: 'B', size: ScoreSize.sheet), on: prefs.scores.carbon, last: true, onChanged: (v) { Haptics.selection(); prefs.setScore(carbon: v); }),
      ]),
    );
  }
}
