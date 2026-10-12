import 'package:flutter/widgets.dart';
import '../logic/fixture.dart';
import '../logic/hours.dart';
import '../logic/menu_view.dart';
import '../logic/plate.dart';
import '../logic/status.dart';
import '../logic/where.dart' show fmtT;
import '../state/store.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';
import 'dish_row.dart';

/// The keys a hall screen needs to find rows in its own list (station heads and dishes), so a jump or a landing reads exact
/// offsets. A copy of a list (a meal change's outgoing one) is built without them.
class ListKeys {
  final stations = <int, GlobalKey>{};
  final rows = <String, GlobalKey>{};
  GlobalKey station(int si) => stations.putIfAbsent(si, GlobalKey.new);
  GlobalKey row(int si, String key) => rows.putIfAbsent('$si.$key', GlobalKey.new);
}

class MealActions {
  final void Function(Dish d) onOpen, onAdd, onInc, onDec;
  final ValueChanged<bool> onReveal;
  const MealActions({required this.onOpen, required this.onAdd, required this.onInc, required this.onDec, required this.onReveal});
}

/// One day's meal at a place as M2 draws it (`renderMenuList`): the Grab 'N Go note, the line over a filtered list, station
/// heads and dish rows, or what an empty list says. `keys` is null for a copy.
class MealList extends StatelessWidget {
  final Fixture fx;
  final String place, meal;
  final int day;
  final bool reveal;
  final String? hereKey; // 'station.dishKey' of the serving a where-served tap landed on
  final ListKeys? keys;
  final MealActions actions;
  const MealList({super.key, required this.fx, required this.place, required this.day, required this.meal, required this.reveal, this.hereKey, this.keys, required this.actions});

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    final iso = dayIsos(fx)[day], menu = fx.days[iso]?[place]?[meal];
    if (menu == null) {
      return _State(text: 'No menu posted for ${dayFull(fx, day)}.');
    }
    final prefs = store.prefs, view = menuView(fx, iso, place, meal, prefs, reveal);
    final now = DateTime.parse(fx.clock), pm = plateMeal(fx, place, meal, now);
    final scores = (health: store.show.health, carbon: store.show.carbon);
    final kids = <Widget>[];
    if (meal == 'grab' && day == 0 && !isCafe(place)) {
      final g = fx.grab[place]!, st = statusText(DiningHallHours.fromJson({'general': {'openTime': g.openTime, 'closeTime': g.closeTime}}), toEastern(now));
      kids.add(Padding(
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.gnotePadTop, M2Space.gutter, M2Layout.gnotePadBottom),
        child: Text.rich(TextSpan(style: M2Text.date.style(M2Color.slate), children: [
          TextSpan(text: st, style: const TextStyle(color: M2Color.vm, fontWeight: FontWeight.w600)),
          TextSpan(text: ', ${fmtT(g.openTime)} to ${fmtT(g.closeTime)}'),
        ])),
      ));
    }
    var si = -1;
    for (final it in menuItems(view, prefs, reveal, '')) {
      switch (it.t) {
        case 'note':
          kids.add(_DietNote(line: it.line!, revealed: reveal, onTap: () => actions.onReveal(!reveal)));
        case 'head':
          si = it.si;
          kids.add(_StationHead(key: keys?.station(si), name: it.name!));
        case 'dish':
          final d = it.dish!;
          kids.add(DishRow(
            key: keys?.row(si, d.key), dish: d, scores: scores, contains: it.contains, here: hereKey == '$si.${d.key}',
            code: day == 0 ? rowCode(store.plates, pm, d.key, place) : null,
            onOpen: () => actions.onOpen(d), onAdd: () => actions.onAdd(d), onInc: () => actions.onInc(d), onDec: () => actions.onDec(d),
          ));
      }
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: kids);
  }
}

/// `.sth`: a station's name, in the deep maroon Oswald, bottom-aligned in a 50 dp slot.
class _StationHead extends StatelessWidget {
  final String name;
  const _StationHead({super.key, required this.name});
  @override
  Widget build(BuildContext context) => Container(
        height: M2Size.stationRow, color: M2Color.chalk, alignment: Alignment.bottomLeft,
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, 0, M2Space.gutter, M2Layout.sthPadBottom),
        child: Semantics(header: true, child: Text(name, style: M2Text.stationHead.style(M2Color.dm))),
      );
}

/// `.dietnote`: the one line over a list that says what it hides (counted), and Show all / Hide them.
class _DietNote extends StatelessWidget {
  final String line;
  final bool revealed;
  final VoidCallback onTap;
  const _DietNote({required this.line, required this.revealed, required this.onTap});
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.noteH, M2Layout.rowPadRight, M2Layout.noteH),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
        child: Row(children: [
          Expanded(child: Text(line, style: M2Text.note.style(M2Color.slate))),
          const SizedBox(width: M2Layout.noteGap),
          TextAction(revealed ? 'Hide them' : 'Show all', onTap: onTap),
        ]),
      );
}

/// What a list says when it has no dishes (`.mst`).
class _State extends StatelessWidget {
  final String text;
  const _State({required this.text});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Space.stateTop, M2Space.gutter, M2Layout.stateBottom),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SizedBox(height: M2Space.paragraph),
          Text(text, style: M2Text.empty.style(M2Color.slate)),
          const SizedBox(height: M2Space.stateGap),
          const SizedBox(height: M2Space.paragraph),
        ]),
      );
}
