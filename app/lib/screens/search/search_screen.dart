import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/widgets.dart';

import '../../core/m2/board.dart';
import '../../core/m2/menu_view.dart' show hits, prefOK;
import '../../core/m2/plate.dart';
import '../../core/m2/search.dart';
import '../../core/m2/status.dart';
import '../../core/m2/variants.dart' show familiesOf, favoriteOf, shownOf;
import '../../core/search.dart' show searchWords;
import '../../core/m2/where.dart' show WhereGroup;
import '../../core/saved_food.dart';
import '../../data/packaged_search.dart' show LookupPhase, PackPhase;
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../../shell/plate_model.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../dish/dish_sheet.dart';
import '../dish/food_sheet.dart';
import '../plate/custom_food.dart' show openCustomFood;
import '../hall/dish_row.dart';
import '../hall/meal_list.dart' show DietNote;
import '../halls/hall_page.dart';
import '../halls/halls_model.dart';
import 'food_row.dart';
import 'glide.dart';
import 'lookup_slots.dart';
import 'net_line.dart';
import 'search_controller.dart';
import 'search_entries.dart';

const _glyphs = {Lens.veg: Glyph.veg, Lens.plant: Glyph.plant, Lens.halal: Glyph.halal, Lens.lowc: Glyph.carbon};

/// Search (M2 `#tab-search`): the field on the maroon header, the lens chips, then the groups. Nothing loads until the tab is first
/// shown. `idle` is what sits above the results while nothing is typed and no lens is on (the events, `flutter-port-search` Task 2). Past
/// the menus come Your foods, Packaged and Search UMass Dining, then the custom-food button (`flutter-port-packaged-foods` Task 3).
class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key, required this.top, required this.tab, this.index = 1, this.query = '', this.lenses = const {}, this.idle});
  final double top;
  /// the shell's selected tab, and the one this is
  final ValueListenable<int> tab;
  final int index;
  final String query;
  final Set<Lens> lenses;
  final Widget? idle;
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _text = TextEditingController(), _focus = FocusNode();
  final _keys = <String, GlobalKey>{};
  SearchController? _c;
  bool _reveal = false;
  List<SearchEntry> _entries = const [];
  final _glide = GlideTracker();
  int _gen = 0;

  @override
  void initState() {
    super.initState();
    _text.text = widget.query;
    widget.tab.addListener(_onTab);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _start(); // (dependencies also change when the keyboard comes up: that must never touch the selection)
  }

  /// The one load, the first time the tab is the one showing: the route's query and lenses go in, the caret after the query.
  void _start() {
    if (_c != null || widget.tab.value != widget.index || !mounted) return;
    final scope = AppScope.of(context);
    _c = SearchController(scope.repo, scope.prefs, scope.plate, packaged: scope.packaged, lookupSource: scope.lookup, foods: scope.foods)..addListener(_changed);
    for (final l in widget.lenses) {
      _c!.toggleLens(l);
    }
    _c!.setQuery(widget.query);
    _text.selection = TextSelection.collapsed(offset: _text.text.length);
    _focus.requestFocus();
  }

  void _onTab() {
    if (widget.tab.value != widget.index || !mounted) return;
    if (_c == null) {
      _start();
      return;
    }
    // coming back to Search is coming back to the field: the last query selected to be typed over (M2 `selectQ`)
    _text.selection = TextSelection(baseOffset: 0, extentOffset: _text.text.length);
    _focus.requestFocus();
  }

  void _changed() {
    if (!mounted) return;
    final c = _c!;
    if (c.generation != _gen) {
      _gen = c.generation;
      _glide.snapshot();
    }
    setState(() {});
  }

  @override
  void dispose() {
    widget.tab.removeListener(_onTab);
    _c?.removeListener(_changed);
    _c?.dispose();
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _query(String q) {
    _c?.setQuery(q);
  }

  /// M2: the keyboard's search key presses the first row's + (or, once it is on the plate, its stepper's +).
  void _submit() {
    final e = _entries.whereType<NowEntry>().firstOrNull, c = _c;
    if (e == null || c?.index == null) return;
    final meal = c!.index!.meal, st = _stand(e, c), ctx = e.cafe ? e.row.g.places.first : null, f = findItem(_plate.state, meal, st.key, ctx);
    if (f != null) {
      _plate.step(f.plate.id, st.key, 1);
    } else {
      _plate.add(meal, st.name, st.refs, null, st.key);
    }
    Haptics.add();
  }

  // ---- rows
  PlateModel get _plate => AppScope.of(context).plate;

  /// What a row stands for as the plate is now (M2 `restand`): a family's row is the variant the typed words fit and the plate last had, with
  /// that variant's own key, name and servings; a dish's is itself.
  ({MenuItem d, String? chip, String key, String name, Map<String, MenuItem> refs}) _stand(NowEntry e, SearchController c) {
    final g = e.row.g, vs = g.vars;
    if (vs == null) return (d: e.row.d, chip: null, key: g.key, name: g.name, refs: g.refs);
    final scope = AppScope.of(context), meal = c.index!.meal;
    final v = vs[varFor(g, searchWords(c.query), _plate.state, meal, allow: _reveal ? null : (d) => prefOK(scope.prefs.diet, d))];
    final d = servingOf(v.refs, _plate.state, meal)!;
    return (d: d, chip: v.chip, key: v.key, name: shownOf(familiesOf(c.index!.fx), d), refs: v.refs);
  }

  double _code(NowEntry e, String meal, String key, Map<String, MenuItem> refs) {
    final f = findItem(_plate.state, meal, key, e.cafe ? e.row.g.places.first : null);
    if (f != null) return f.item.qty;
    return wouldSplit(_plate.state, meal, refs.keys.toList()) ? -1 : 0;
  }

  String _where(Board fx, List<String> places) {
    final names = [for (final p in places) placeName(fx, p)];
    return names.length < 2 ? names.join() : '${names.sublist(0, names.length - 1).join(', ')} and ${names.last}';
  }

  Widget _tags(Board fx, List<String> places, String said) {
    final cafes = places.where(isCafe).toList();
    return HallTags(
      halls: [for (final p in places) if (!isCafe(p)) p],
      cafe: cafes.isEmpty ? null : cafes.length == 1 ? placeName(fx, cafes.first) : '${cafes.length} cafés',
      label: '$said at ${_where(fx, places)}',
    );
  }

  void _open(MenuItem d, {required String place, required String meal, required int day, Map<String, MenuItem>? refs}) {
    final c = _c!, fx = c.index!.fx, scope = AppScope.of(context);
    _focus.unfocus();
    openDishSheet(
      context, dish: d, place: place, meal: meal, day: day, fx: fx, avoid: scope.prefs.diet.avoid, refs: refs,
      cafeIds: c.cafeIds,
      onServe: (p, g) => ShellScope.of(context).openPlace(p, meal: g.meal, day: g.day, dish: d.key),
    );
  }

  Widget _now(NowEntry e, SearchController c) {
    final scope = AppScope.of(context), fx = c.index!.fx, meal = c.index!.meal, g = e.row.g, st = _stand(e, c), d = st.d, ctx = e.cafe ? g.places.first : null;
    final place = st.refs.entries.firstWhere((x) => identical(x.value, d)).key;
    final fam = g.vars == null ? null : familiesOf(fx).familyOf(d);
    return DishRow(
      key: ValueKey(e.id), dish: d, scores: scope.prefs.scores, contains: _reveal ? hits(scope.prefs.diet, d) : const [],
      favorite: scope.prefs.isFavorite(fam == null ? d.dishName : favoriteOf(fam)), family: st.chip == null ? null : g.name, chip: st.chip,
      code: _code(e, meal, st.key, st.refs), track: scope.prefs.track, tags: _tags(fx, g.places, 'Served now'),
      onOpen: () => _open(d, place: place, meal: meal, day: 0, refs: st.refs),
      onAdd: () {
        _plate.add(meal, st.name, st.refs, null, st.key);
        Haptics.add();
      },
      onInc: () {
        final f = findItem(_plate.state, meal, st.key, ctx);
        if (f != null) {
          _plate.step(f.plate.id, st.key, 1);
          Haptics.add();
        }
      },
      onDec: () {
        final f = findItem(_plate.state, meal, st.key, ctx);
        if (f != null) {
          _plate.step(f.plate.id, st.key, -1);
          Haptics.remove();
        }
      },
    );
  }

  String _said(WhereGroup g) => g.meal == 'all' ? (g.day > 0 ? 'Tomorrow' : 'Later') : g.day > 0 ? 'Tomorrow ${g.meal == 'grab' ? "Grab 'N Go" : mealLabel[g.meal]!.toLowerCase()}' : mealLabel[g.meal]!;

  Widget _food(SavedFood f, SearchController c) {
    final scope = AppScope.of(context), meal = c.index?.meal ?? clockMeal(scope.repo.now());
    ({Plate plate, PlateItem item})? on() => findItem(_plate.state, meal, f.key);
    return FoodRow(
      key: ValueKey('f:${f.id}'), food: f, code: on()?.item.qty ?? 0,
      onOpen: () {
        _focus.unfocus();
        openFoodSheet(context, food: f, meal: meal);
      },
      // kept in Your foods the first time it is added (never over a copy already there), then on the plate as the kept food
      onAdd: () {
        Haptics.add();
        (scope.foods?.keep(f) ?? Future.value(f)).then((k) => _plate.addFood(meal, k));
      },
      onInc: () {
        final x = on();
        if (x != null) {
          _plate.step(x.plate.id, f.key, 1);
          Haptics.add();
        }
      },
      onDec: () {
        final x = on();
        if (x != null) {
          _plate.step(x.plate.id, f.key, -1);
          Haptics.remove();
        }
      },
    );
  }

  Widget _later(LaterEntry e, SearchController c) {
    final scope = AppScope.of(context), fx = c.index!.fx, g = e.row.g, d = e.row.d, said = _said(g), fam = e.row.family;
    return DishRow(
      key: ValueKey(e.id), dish: d, scores: scope.prefs.scores, contains: _reveal ? hits(scope.prefs.diet, d) : const [],
      favorite: scope.prefs.isFavorite(fam == null ? d.dishName : favoriteOf(fam)), family: fam?.name, chip: fam == null ? null : familiesOf(fx).variantIn(d)?.chip,
      tail: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(said, style: M2Text.meta.style(M2Color.slate)),
        const SizedBox(width: M2Layout.nextToTags),
        _tags(fx, g.halls, said),
      ]),
      onOpen: () => _open(d, place: g.halls.first, meal: g.meal, day: g.day), onAdd: () {}, onInc: () {}, onDec: () {},
    );
  }

  Widget _place(PlaceEntry e, SearchController c) {
    final fx = c.index!.fx, now = c.index!.now, key = e.hit.key;
    final name = placeName(fx, key);
    switch (e.hit) {
      case GrabHit():
        final g = fx.grab[key]!, h = DiningHallHours(hallTid: 0, general: g);
        return PlaceRow(
          name: "$name Grab 'N Go", detail: name, status: statusText(h, now), open: isOpenNow(h, now), photo: photoOf(key, ''),
          onTap: () => _push(HallMenuPage(place: key, top: widget.top, meal: 'grab')),
        );
      case CafeHit(:final item):
        final p = fx.places.firstWhere((p) => p.key == key), h = fx.hours[key];
        return PlaceRow(
          name: name, detail: item ?? p.building, clampDetail: item != null, status: h == null ? '' : statusText(h, now), open: h != null && isOpenNow(h, now), photo: photoOf(key, name),
          onTap: () => _push(HallMenuPage(place: key, top: widget.top)),
        );
      case HallHit():
        throw StateError('halls are cards');
    }
  }

  void _push(Widget page) {
    _focus.unfocus();
    Nav.push<void>(context, (_) => page);
  }

  Widget _cards(HallCardsEntry e, SearchController c) {
    final scope = AppScope.of(context), top = widget.top;
    final vm = buildHalls(now: scope.repo.now(), state: c.hallsData.state, reads: c.hallsData.reads, pins: const [], charlesRiver: scope.prefs.charlesRiver, board: c.board, favorites: scope.prefs.favorites, day: scope.repo.today);
    return Container(
      color: M2Color.dm, margin: const EdgeInsets.only(top: M2Layout.cardsTop, bottom: M2Layout.cardsBottom),
      child: Column(children: [
        for (final b in vm.halls)
          if (e.keys.contains(b.key))
            ListenableBuilder(
              key: _keys.putIfAbsent(b.key, GlobalKey.new), listenable: scope.hider,
              builder: (_, _) => Opacity(
                opacity: scope.hider.hides(b.key) ? 0 : 1,
                child: Band(
                  name: b.name, card: true, star: b.star, status: b.status, photo: bandPhoto(b, top),
                  busy: b.lamps == null ? null : Meter(lit: b.lamps!),
                  onTap: () => _openCard(b, scope),
                ),
              ),
            ),
      ]),
    );
  }

  void _openCard(BandVM b, AppScope scope) {
    _focus.unfocus();
    scope.prefs.lastHall = b.key;
    final box = _keys[b.key]!.currentContext!.findRenderObject()! as RenderBox, o = box.localToGlobal(Offset.zero);
    Nav.openCard<void>(
      context, source: b.key, hider: scope.hider, off: bandOff(b.key, widget.top),
      band: Rect.fromLTWH(o.dx, o.dy + M2Layout.seam, box.size.width, box.size.height - M2Layout.seam),
      builder: (_, page) => HallPage(band: b, page: page, top: widget.top, card: true),
    );
  }

  Widget _entry(SearchEntry e, SearchController c) {
    return KeyedSubtree(
      key: ValueKey(e.id),
      child: Glide(id: e.id, tracker: _glide, generation: c.generation, child: switch (e) {
        GroupHead(:final title) => Padding(
            padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.groupTop, M2Space.gutter, M2Layout.groupBottom),
            child: Semantics(header: true, child: Text(title, style: M2Text.station.normal().style(M2Color.dm))),
          ),
        HallCardsEntry() => _cards(e, c),
        PlaceEntry() => _place(e, c),
        DietLine(:final text, :final revealed) => DietNote(line: text, revealed: revealed, onTap: () {
            Haptics.selection();
            setState(() => _reveal = !revealed);
          }),
        NowEntry() => _now(e, c),
        LaterEntry() => _later(e, c),
        EmptyEntry(:final text) => Padding(
            padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.emptyTop, M2Space.gutter, M2Layout.emptyBottom),
            child: Text(text, style: M2Text.empty.style(M2Color.slate)),
          ),
        FoodEntry(:final food) => _food(food, c),
        PackWaitEntry() => const PackWait(),
        PackFailEntry() => PackFail(onRetry: () {
            Haptics.light();
            c.pack?.retry();
          }),
        LookupButtonEntry(:final query) => LookupButton(query: query, onTap: () {
            Haptics.light();
            _focus.unfocus();
            c.askLookup();
          }),
        LookupStateEntry(:final phase, :final query, :final resetsAt, :final reason) => LookupStatus(phase: phase, query: query, resetsAt: resetsAt, reason: reason, onRetry: () {
            Haptics.light();
            c.askLookup();
          }),
        CustomEntry(:final query, :final solid) => CustomFoodButton(label: 'Add “$query” as a custom food', solid: solid, onTap: () {
            _focus.unfocus();
            openCustomFood(context, name: query, meal: c.index?.meal ?? clockMeal(AppScope.of(context).repo.now()));
          }),
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), top = widget.top, c = _c, ix = c?.index;
    final meal = ix?.meal ?? clockMeal(scope.repo.now());
    final extras = c == null
        ? const <SearchEntry>[]
        : extraEntries(
            track: scope.prefs.track, online: c.net != NetLine.offline, query: c.query, foods: scope.foods?.foods ?? const [],
            pack: c.pack?.phase ?? PackPhase.idle, packHits: c.pack?.hits ?? const [], lookup: c.lookup?.phase ?? LookupPhase.idle, lookupFoods: c.lookup?.foods ?? const [], resetsAt: c.lookup?.resetsAt, reason: c.lookup?.reason,
          );
    final entries = c == null || ix == null
        ? const <SearchEntry>[]
        : searchEntries(raw: c.result, query: c.query, lenses: c.lenses, meal: meal, prefs: scope.prefs.diet, reveal: _reveal, track: scope.prefs.track, extras: extras, net: c.menusIn ? c.net : NetLine.failed);
    _entries = entries;
    final ids = {for (var i = 0; i < entries.length; i++) entries[i].id: i}; // a row that survives a keystroke keeps its element at its new index
    final idle = c != null && c.query.trim().isEmpty && c.lenses.isEmpty;
    return ColoredBox(
      color: M2Color.chalk,
      child: ListenableBuilder(
        listenable: Listenable.merge([scope.plate, scope.prefs]),
        builder: (context, _) => CustomScrollView(
          physics: const ClampingScrollPhysics(),
          slivers: [
            SliverPersistentHeader(
              pinned: true,
              delegate: _FieldHeader(
                height: top + M2Layout.searchHeadTop + M2Layout.fieldH + M2Layout.searchHeadBottom,
                child: Container(
                  color: M2Color.dm,
                  padding: EdgeInsets.fromLTRB(M2Space.gutter, top + M2Layout.searchHeadTop, M2Space.gutter, M2Layout.searchHeadBottom),
                  child: SearchField(
                    controller: _text, focus: _focus, hint: 'Search ${mealLabel[meal]!.toLowerCase()} at every hall', onChanged: _query,
                    onSubmit: _submit,
                    onClear: () {
                      _text.clear();
                      _query('');
                      _focus.requestFocus();
                    },
                  ),
                ),
              ),
            ),
            SliverToBoxAdapter(child: _lenses(c)),
            if (c != null && c.net == NetLine.offline) SliverToBoxAdapter(child: NetNote(text: offlineLine(c.savedCafes))),
            if (c != null && c.net == NetLine.failed) SliverToBoxAdapter(child: NetFail(onRetry: () { Haptics.light(); c.hallsData.retry(); })),
            if (idle && widget.idle != null && c.net != NetLine.failed) SliverToBoxAdapter(child: widget.idle),
            SliverList(delegate: SliverChildBuilderDelegate((context, i) => _entry(entries[i], c!), childCount: entries.length, addAutomaticKeepAlives: false, findChildIndexCallback: (k) => ids[(k as ValueKey<String>).value])),
            SliverToBoxAdapter(child: SizedBox(height: M2Layout.listFoot + safeBottom(context) + MediaQuery.viewInsetsOf(context).bottom)),
          ],
        ),
      ),
    );
  }

  Widget _lenses(SearchController? c) => Container(
        decoration: const BoxDecoration(color: M2Color.chalk, border: Border(bottom: BorderSide(color: M2Color.hair))),
        height: M2Layout.lensesTop + M2Size.tap + M2Layout.lensesBottom + M2Layout.hairline,
        child: SingleChildScrollView(
          scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter, vertical: M2Layout.lensesTop),
          child: Row(children: [
            for (final l in Lens.values) ...[
              if (l != Lens.values.first) const SizedBox(width: M2Layout.lensGap),
              FilterChipButton(label: lensLabel[l]!, selected: c?.lenses.contains(l) ?? widget.lenses.contains(l), glyph: _glyphs[l], onTap: c == null ? null : () {
                Haptics.light();
                c.toggleLens(l);
              }),
            ],
          ]),
        ),
      );
}

class _FieldHeader extends SliverPersistentHeaderDelegate {
  _FieldHeader({required this.height, required this.child});
  final double height;
  final Widget child;
  @override
  double get minExtent => height;
  @override
  double get maxExtent => height;
  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) => child;
  @override
  bool shouldRebuild(_FieldHeader old) => true;
}
