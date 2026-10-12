import 'package:flutter/widgets.dart';
import '../logic/dish_sheet.dart';
import '../logic/fixture.dart';
import '../logic/hours.dart';
import '../logic/menu_view.dart';
import '../shell_api.dart';
import '../state/store.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

/// You, as rounds 9 and 9b lay it out: the day so far (today's totals and the meals logged), then Dietary preferences (a page pushed
/// from the right), the Charles River Campus toggle and Show on dishes. Everything it toggles is the store's, so the menus, the dish
/// sheet and the bar change with it. Favorites, ranking, Export and the round-10 history are not in the bake-off.
class YouScreen extends StatelessWidget {
  final double top;
  const YouScreen({super.key, required this.top});

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context), fx = store.fx, show = store.show;
    var cal = 0.0, p = 0.0, c = 0.0, f = 0.0;
    for (final e in store.log) {
      for (final i in e.items) {
        cal += i.cal * i.qty;
        p += i.p * i.qty;
        c += i.c * i.qty;
        f += i.f * i.qty;
      }
    }
    Widget h2(String t) => Padding(padding: const EdgeInsets.only(bottom: M2Layout.secTitleGap), child: Semantics(header: true, child: Text(t, style: M2Text.section.style(M2Color.dm))));
    Widget sec(List<Widget> kids, {double top = M2Layout.secTop}) => Padding(
          padding: EdgeInsets.fromLTRB(M2Space.gutter, top, M2Space.gutter, 0),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: kids),
        );
    final time = formatTimeOfDay(toEastern(DateTime.parse(fx.clock)));
    return ColoredBox(
      color: M2Color.chalk,
      child: SingleChildScrollView(
        physics: const ClampingScrollPhysics(),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          ScreenHeader.title(top: top, title: 'You', date: dayFull(fx, 0), bottomPad: M2Layout.youHeadBottom, dateLeft: true),
          sec([h2('Today'), Facts(cal: cal, p: p, c: c, f: f)], top: M2Layout.todayTop),
          sec([
            h2('Meals'),
            if (store.log.isEmpty) Text('Nothing logged yet today.', style: M2Text.sched.style(M2Color.slate)),
            for (final e in store.log.reversed)
              LRow(
                title: '${mealLabel[e.meal]}${e.place != null ? ' at ${placeName(fx, e.place!)}' : ''}', subtitle: time, chevron: false,
                trailing: Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                  Text(fc(e.items.fold(0.0, (a, i) => a + i.cal * i.qty)), style: M2Text.mealCal.style(M2Color.ink)),
                  const SizedBox(width: M2Layout.mealCalGap),
                  Text('cal', style: M2Text.meta.style(M2Color.slate)),
                ]),
              ),
          ]),
          sec([
            LRow(
              title: 'Dietary preferences', subtitle: prefSummary(store.prefs), last: true,
              onTap: () => ShellScope.of(context).pushPage((ctx, pop) => DietPage(top: top, onBack: pop)),
            ),
          ]),
          sec([h2('Campus'), CheckRow(label: 'Charles River Campus', line: 'Newton', on: store.newton, last: true, onChanged: (v) { Haptics.selection(); store.setNewton(v); })]),
          sec([
            h2('Show on dishes'),
            CheckRow(label: 'Healthfulness', lead: const ScoreBadge(kind: ScoreKind.health, value: 5, size: ScoreSize.sheet), on: show.health, onChanged: (v) { Haptics.selection(); store.setShow(health: v); }),
            CheckRow(label: 'Carbon rating', lead: const ScoreBadge(kind: ScoreKind.carbon, value: 'B', size: ScoreSize.sheet), on: show.carbon, last: true, onChanged: (v) { Haptics.selection(); store.setShow(carbon: v); }),
          ]),
          SizedBox(height: M2Layout.listFoot + MediaQuery.paddingOf(context).bottom),
        ]),
      ),
    );
  }
}

/// M2's Dietary preferences page: "Only show" (the diet marks), then "Avoid" (the feed's allergens, in `allergens`' order).
class DietPage extends StatelessWidget {
  final double top;
  final VoidCallback onBack;
  const DietPage({super.key, required this.top, required this.onBack});

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context), prefs = store.prefs;
    Widget head(String t, double gap) => Padding(padding: EdgeInsets.only(top: gap, bottom: M2Layout.secTitleGap), child: Semantics(header: true, child: Text(t, style: M2Text.section.style(M2Color.dm))));
    return ColoredBox(
      color: M2Color.chalk,
      child: Column(children: [
        ScreenHeader.page(top: top, title: 'Dietary preferences', onBack: onBack),
        Expanded(
          child: SingleChildScrollView(
            physics: const ClampingScrollPhysics(),
            padding: EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.pbodyTop, M2Space.gutter, M2Layout.pbodyBottom + M2Layout.listFoot),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              head('Only show', M2Layout.dietTop),
              CheckRow(label: 'Vegetarian', on: prefs.veg, onChanged: (v) { Haptics.selection(); store.setPrefs(veg: v); }),
              CheckRow(label: 'Plant based', on: prefs.plant, onChanged: (v) { Haptics.selection(); store.setPrefs(plant: v); }),
              CheckRow(label: 'Halal', on: prefs.halal, onChanged: (v) { Haptics.selection(); store.setPrefs(halal: v); }),
              head('Avoid', M2Layout.dietGroupTop),
              for (var i = 0; i < allergens.length; i++)
                CheckRow(
                  label: allergens[i][0] + allergens[i].substring(1).toLowerCase(), on: prefs.avoid.contains(allergens[i]), last: i == allergens.length - 1,
                  onChanged: (v) {
                    Haptics.selection();
                    store.setPrefs(avoid: [for (final a in allergens) if (a == allergens[i] ? v : prefs.avoid.contains(a)) a]);
                  },
                ),
            ]),
          ),
        ),
      ]),
    );
  }
}
