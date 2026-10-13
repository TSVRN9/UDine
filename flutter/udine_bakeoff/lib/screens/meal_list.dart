import 'package:flutter/widgets.dart';
import '../logic/fixture.dart';
import '../logic/hours.dart';
import '../logic/menu_view.dart';
import '../logic/net.dart';
import '../logic/schedule.dart' show eventOn;
import '../logic/plate.dart';
import '../logic/status.dart';
import '../logic/where.dart' show fmtT;
import '../state/store.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';
import 'dish_row.dart';

/// The keys a hall screen needs to find rows in its own list: station heads (a handful) and the one dish a where-served tap landed
/// on. A copy of a list (a meal change's outgoing one) is built without them.
class ListKeys {
  final stations = <int, GlobalKey>{};
  final rows = <String, GlobalKey>{};
  GlobalKey station(int si) => stations.putIfAbsent(si, GlobalKey.new);
  GlobalKey row(int si, String key) => rows.putIfAbsent('$si.$key', GlobalKey.new);
}

class MealActions {
  final void Function(Dish d) onOpen, onAdd, onInc, onDec;
  final ValueChanged<bool> onReveal;
  final VoidCallback onRetry;
  final ValueChanged<int> onEvent;
  const MealActions({required this.onOpen, required this.onAdd, required this.onInc, required this.onDec, required this.onReveal, required this.onRetry, required this.onEvent});
}

enum ItemKind { grab, event, note, head, dish, state, retry, spinner, cafe }

/// One thing in the list, before it is a widget: cheap to make for the whole menu, built into a widget only when it scrolls near.
class ListItem {
  final ItemKind kind;
  final int si;
  final Dish? dish;
  final List<String> contains;
  final String? text;
  final TimeWindow? grab;
  final int ev;
  const ListItem(this.kind, {this.si = -1, this.dish, this.contains = const [], this.text, this.grab, this.ev = -1});
  String get id => switch (kind) { ItemKind.head => 'h$si', ItemKind.dish => '$si.${dish!.key}', ItemKind.event => 'e$ev', _ => kind.name };
}

/// What the list says for a place's meal on a day (M2 `renderMenuList`): the Grab 'N Go note, the line over a filtered list, station
/// heads and dish rows, or what an empty list says.
List<ListItem> mealItems(Fixture fx, Prefs prefs, String place, int day, String meal, bool reveal, {MenuState state = MenuState.ok}) {
  final iso = dayIsos(fx)[day], menu = fx.days[iso]?[place]?[meal];
  // what a list says when there is nothing to list (M2 `renderMenuList`): loading, not saved offline, didn't load, nothing posted
  switch (state) {
    case MenuState.loading:
      return const [ListItem(ItemKind.spinner)];
    case MenuState.offline:
      return [ListItem(ItemKind.state, text: "You're offline, and the menu for ${dayFull(fx, day)} isn't saved on this phone.")];
    case MenuState.fail:
      return [ListItem(ItemKind.retry, text: "${placeName(fx, place)}'s menu${day > 0 ? ' for ${dayFull(fx, day)}' : ''} didn't load.")];
    case MenuState.ok:
      break;
  }
  if (menu == null) return [ListItem(ItemKind.state, text: 'No menu posted for ${dayFull(fx, day)}.')];
  final view = menuView(fx, iso, place, meal, prefs, reveal), out = <ListItem>[];
  if (meal == 'grab' && day == 0 && !isCafe(place)) out.add(ListItem(ItemKind.grab, grab: fx.grab[place]));
  // an event shows on its own day's menu, a quiet row on chalk (its date would only repeat the day)
  for (var i = 0; i < fx.events.length; i++) {
    if (eventOn(fx, fx.events[i], place, day)) out.add(ListItem(ItemKind.event, text: fx.events[i].title, ev: i));
  }
  var si = -1;
  for (final it in menuItems(view, prefs, reveal, '')) {
    switch (it.t) {
      case 'note':
        out.add(ListItem(ItemKind.note, text: it.line));
      case 'head':
        si = it.si;
        out.add(ListItem(ItemKind.head, si: si, text: it.name));
      case 'dish':
        out.add(ListItem(ItemKind.dish, si: si, dish: it.dish, contains: it.contains));
    }
  }
  return out;
}

/// A café that posts no dish menu (11 of the 29): what it is and a line saying so (M2 `cafeBody`; "Add a custom food" is deferred).
List<ListItem> cafeItems(Fixture fx, String place) => [ListItem(ItemKind.cafe, text: place)];

/// An item as a widget. `keys` is null for a copy.
Widget buildItem(BuildContext context, ListItem it, {required Fixture fx, required Store store, required String place, required int day, required String meal, required bool reveal, String? hereKey, ListKeys? keys, required MealActions actions}) {
  switch (it.kind) {
    case ItemKind.state:
      return _State(text: it.text!);
    case ItemKind.retry:
      return _State(text: it.text!, onRetry: actions.onRetry);
    case ItemKind.spinner:
      return const SizedBox(height: M2Size.mstate, child: Center(child: Spinner()));
    case ItemKind.event:
      return _EventNote(title: it.text!, onTap: () => actions.onEvent(it.ev));
    case ItemKind.cafe:
      final p = fx.places.firstWhere((x) => x.key == place);
      return _CafeBody(name: p.name, description: p.description);
    case ItemKind.grab:
      final g = it.grab!, now = DateTime.parse(fx.clock), st = statusText(DiningHallHours.fromJson({'general': {'openTime': g.openTime, 'closeTime': g.closeTime}}), toEastern(now));
      return Padding(
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.gnotePadTop, M2Space.gutter, M2Layout.gnotePadBottom),
        child: Text.rich(TextSpan(style: M2Text.date.style(M2Color.slate), children: [
          TextSpan(text: st, style: const TextStyle(color: M2Color.vm, fontWeight: FontWeight.w600)),
          TextSpan(text: ', ${fmtT(g.openTime)} to ${fmtT(g.closeTime)}'),
        ])),
      );
    case ItemKind.note:
      return _DietNote(line: it.text!, revealed: reveal, onTap: () => actions.onReveal(!reveal));
    case ItemKind.head:
      return _StationHead(key: keys?.station(it.si) ?? ValueKey(it.id), name: it.text!);
    case ItemKind.dish:
      final d = it.dish!, pm = plateMeal(fx, place, meal, DateTime.parse(fx.clock)), here = hereKey == it.id;
      return DishRow(
        key: keys != null && here ? keys.row(it.si, d.key) : ValueKey(it.id), dish: d, scores: (health: store.show.health, carbon: store.show.carbon), contains: it.contains, here: here,
        code: day == 0 ? rowCode(store.plates, pm, d.key, place) : null,
        onOpen: () => actions.onOpen(d), onAdd: () => actions.onAdd(d), onInc: () => actions.onInc(d), onDec: () => actions.onDec(d),
      );
  }
}

/// The list as a lazy sliver with stable keys: a day or meal change, an add, or the container finishing its open builds only the rows
/// that are near the screen. The rows a copy or a jump needs are built when the scroll gets there.
class MealSliver extends StatelessWidget {
  final Fixture fx;
  final List<ListItem> items;
  final String place, meal;
  final int day;
  final bool reveal;
  final String? hereKey;
  final ListKeys keys;
  final MealActions actions;
  final Key? sliverKey;
  /// wraps every row in the container's back-drag recogniser (see HallMenu.dragWrap)
  final Widget Function(Widget child)? dragWrap;
  const MealSliver({super.key, this.sliverKey, this.dragWrap, required this.fx, required this.items, required this.place, required this.day, required this.meal, required this.reveal, this.hereKey, required this.keys, required this.actions});

  @override
  Widget build(BuildContext context) {
    final store = StoreScope.of(context);
    final index = {for (var i = 0; i < items.length; i++) ValueKey(items[i].id): i};
    return SliverList(
      key: sliverKey,
      delegate: SliverChildBuilderDelegate(
        (context, i) {
          final child = buildItem(context, items[i], fx: fx, store: store, place: place, day: day, meal: meal, reveal: reveal, hereKey: hereKey, keys: keys, actions: actions);
          return KeyedSubtree(key: ValueKey(items[i].id), child: dragWrap == null ? child : dragWrap!(child));
        },
        childCount: items.length,
        findChildIndexCallback: (k) => index[k],
        addAutomaticKeepAlives: false,
      ),
    );
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
  final VoidCallback? onRetry;
  const _State({required this.text, this.onRetry});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Space.stateTop, M2Space.gutter, M2Layout.stateBottom),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SizedBox(height: M2Space.paragraph),
          Text(text, style: M2Text.empty.style(M2Color.slate)),
          const SizedBox(height: M2Space.stateGap),
          const SizedBox(height: M2Space.paragraph),
          if (onRetry != null) Button(kind: ButtonKind.line, label: 'Try again', expand: true, onTap: onRetry),
        ]),
      );
}

/// `.evrow.evnote`: an event on its own day's menu: its title on chalk, a hairline under it, no date (the day says it). It opens the
/// event page.
class _EventNote extends StatelessWidget {
  final String title;
  final VoidCallback onTap;
  const _EventNote({required this.title, required this.onTap});
  @override
  Widget build(BuildContext context) => Press(
        overlay: M2Color.pressRow, label: title, onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: M2Size.evrow),
          padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter, vertical: M2Space.evrow),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
          alignment: Alignment.topLeft, // (`align-items: baseline`: the title sits at the padding, the row's minimum is empty room below)
          child: ExcludeSemantics(child: Text(title, style: M2Text.link.style(M2Color.dm))),
        ),
      );
}

/// `.cbody`: a café with no dish menu: its description, a Menu heading and the line saying so.
class _CafeBody extends StatelessWidget {
  final String name, description;
  const _CafeBody({required this.name, required this.description});
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Space.cafeBodyTop, M2Space.gutter, 0),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (description.isNotEmpty) Text(description, style: M2Text.desc.style(M2Color.ink)),
          Padding(padding: const EdgeInsets.only(top: M2Space.group), child: Semantics(header: true, child: Text('Menu', style: M2Text.section.style(M2Color.dm)))),
          Padding(padding: const EdgeInsets.only(top: M2Layout.kvTop), child: Text("$name doesn't list its menu in the app.", style: M2Text.ing.style(M2Color.slate))),
        ]),
      );
}
