import 'dart:math' as math;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/bowl.dart' show Syn, synOf;
import '../../core/m2/bowl_builder.dart' show BowlSpec;
import '../../core/m2/menu_view.dart';
import '../../core/m2/plate.dart';
import '../../core/m2/variants.dart' show familiesOf, shownOf;
import '../../core/hours.dart' show openSpan;
import '../../core/occupancy.dart';
import '../../core/m2/places.dart' show Roster, hallKeyOfTitle;
import '../../core/m2/schedule.dart' show schedule, statusLine;
import '../../data/repository.dart' show resolveCafeMenu;
import '../cafes/cafe_body.dart';
import '../cafes/pdf_rows.dart';
import '../cafes/cafes_model.dart' show NoMenuBody, cafeBody;
import '../../core/m2/where.dart' show WhereGroup;
import '../../motion/container_math.dart';
import '../../motion/container_transform.dart';
import '../../shell/app_scope.dart';
import '../../shell/plate_model.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../dish/dish_sheet.dart';
import 'hall_controller.dart';
import 'hall_header.dart';
import 'busy.dart';
import 'meal_list.dart';
import 'meal_pager.dart';
import 'meal_tabs.dart';
import 'schedule_sheet.dart';
import 'station_switcher.dart';

/// A host's own handling of a dish row's tap, in place of the dish sheet (a test seam): the serving that was tapped, the place and
/// meal it is on and the day showing (an index into the 15, 0 today).
typedef DishTap = void Function(MenuItem dish, {required String place, required String meal, required int day});

/// The hall screen (M2 `#menu`): the header over the photo, the meal tabs and the station row pinned under it, and the list. One
/// `progress` (the container transform's open; whole at rest and when pushed) and the scroll offset drive every animated property,
/// as M2's `paint(p, y)`. A hall and a café with dishes alike (a café has no letter and no busy row); it is the whole body a café page
/// hosts. `place` is `W F H B` or `c<i>`; the body loads its own hours and menus from the app's repository.
/// The status line and the day cell open the schedule, whose day rows change the day (M2 `changeDay`).
///
/// Hooks for what comes next: `onOpenDish`, `onEvent`.
class HallMenu extends StatefulWidget {
  final String place;
  final double top, height;
  final Animation<double> progress;
  final BandRect? band;
  /// the band's own copy, drawn over the photo while the container opens
  final Widget? ghost;
  final BandParts? parts;
  /// the status line and the meter the band showed, drawn until the page's own arrive (they travel with the card from its first frame)
  final String? seedStatus;
  final ({int lamps, String word, bool extra})? seedBusy;
  /// an index into the 15 days (0 today); `meal` is M2's key (`lunch`, `late`, `grab`), kept if the day has it
  final int day;
  final String? meal;
  final VoidCallback onBack;
  final DishTap? onOpenDish;
  /// a dish's name: its sheet opens over the menu once the menu is in
  final String? dish;
  /// a dish's key: the menu arrives scrolled to it, the row tinted
  final String? landOn;
  final ValueChanged<int>? onEvent;
  /// Wraps the scrolling list in the container's back-drag recogniser, a descendant of the scroll view so that, at the top, a drag
  /// down is claimed before the list's own (M2 decides the axis itself, on its first move).
  final Widget Function(Widget child)? dragWrap;
  const HallMenu({
    super.key, required this.place, required this.top, required this.height, this.progress = kAlwaysCompleteAnimation, this.band, this.ghost, this.parts, this.seedStatus, this.seedBusy,
    this.day = 0, this.meal, required this.onBack, this.onOpenDish, this.dish, this.landOn, this.onEvent, this.dragWrap,
  });
  @override
  State<HallMenu> createState() => HallMenuState();
}

class HallMenuState extends State<HallMenu> with TickerProviderStateMixin {
  late int _day = widget.day;
  late String _meal;
  PlateModel? _plate;
  // "Show all" (M2 `S.reveal`): kept across days, reset only by leaving the page; the preferences themselves are never written
  bool _reveal = false;
  // the dish a where-served tap landed on (a list item's id), and what is still to do once the menu is in
  String? _here, _pendingLand, _pendingDish;
  HallController? _c;
  final _sc = ScrollController();
  final _scrollY = ValueNotifier<double>(0);
  // M2 `arrive()`: when a menu that was loading or failed lands, tabs, station name and list fade in from nothing over `settle`
  late final AnimationController _arrive = AnimationController(vsync: this, value: 1, duration: M2Motion.settle.duration);
  // M2 `changeDay`: everything that says the day fades out in place, then the new day fades in (the list from .97); `_dayIn` while the
  // second leg runs, which is when the list scales. `_flash` is "Show all"'s list flash.
  late final AnimationController _dayFade = AnimationController(vsync: this, value: 1, animationBehavior: AnimationBehavior.preserve); // (reduced motion is rmFade at its own length, not the framework's shortcut)
  late final AnimationController _flash = AnimationController(vsync: this, value: 1, animationBehavior: AnimationBehavior.preserve);
  bool _dayIn = false;
  MenuState _seen = MenuState.ok;
  final _status = ValueNotifier<String>('');
  final _busy = ValueNotifier<HallBusyView?>(null);
  OccupancyRead? _busyRead;
  // M2 R13 `LATE_D` / `busyStep`: the header is as tall as the busy block it has plus [_h0]; a reading landing grows the block (and the header, the
  // tabs and the list with it) over the first part of `settle`, then its text and chart fade in. The title is anchored by the header's foot, so
  // it never moves. `_late` is linear time over `settle`; a header opened with its reading (or the card's) is whole at 1.
  late final AnimationController _late = AnimationController(vsync: this, value: 1, duration: M2Motion.settle.duration, animationBehavior: AnimationBehavior.preserve)..addListener(_onLate);
  double _h0 = 0, _blockFrom = 0, _blockTo = 0;
  bool _synced = false, _lateGrows = true;
  double _seenBlock = 0;
  void _onLate() {
    if (!mounted) return;
    // a header that has been scrolled away keeps its collapse: the list rides down by what the block adds, so the offset goes with it (M2's
    // pushed hall has its block from the start; here it can land after the scroll to the dish)
    final b = _block, d = b - _seenBlock;
    _seenBlock = b;
    if (d != 0 && _sc.hasClients && _sc.offset > 0) _sc.jumpTo(_sc.offset + d);
    setState(() {});
  }

  /// the busy block's height now
  double get _block => _blockFrom + (_blockTo - _blockFrom) * lateStep(_late.value, reduced: reducedMotion(context)).grow;
  final _keys = ListKeys();
  final _listKey = GlobalKey(), _pagerKey = GlobalKey<SharedAxisLayerState>();
  List<ListItem> _items = const [];
  late final AnimationController _jumpC = AnimationController(vsync: this);
  final _station = ValueNotifier<int?>(null);
  SheetHandle? _stationsSheet;
  // the dietary preferences You writes (device-only); read here as menus filter on them
  Prefs get _prefs => AppScope.of(context).prefs.diet;

  String get place => widget.place;
  HallController get c => _c!;
  Board get fx => c.board;
  bool get _cafe => isCafe(place);
  String get _iso => c.isos[_day];
  String get iso0 => c.isos.first;
  bool get _dishMenu => c.hasMenu;
  MenuState get _state => _dishMenu ? c.state(_day) : MenuState.ok;
  // a café that posts one menu a day has no tab row (its day cell leads the station row), once its menu is known
  bool get _oneMeal => _cafe && _dishMenu && _state == MenuState.ok && isOneMeal(fx, place);
  double get _th => (_cafe && !_dishMenu) || _oneMeal ? 0 : M2Layout.stationRowH;
  double get _sw => _cafe && !_dishMenu ? 0 : M2Layout.stationRowH;
  double get _hh => _cafe ? headerHeight(widget.top) : _h0 + _block;
  double get _ch => widget.top + M2Layout.barH;
  double get _r => _hh - _ch;
  double get _pin => _ch + _th + _sw;
  /// The day showing, for tests.
  int get debugDay => _day;
  bool get atTop => !_sc.hasClients || _sc.offset <= 0;

  @override
  void initState() {
    super.initState();
    _sc.addListener(_onScroll);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_c == null) {
      final scope = AppScope.of(context);
      _meal = widget.meal ?? clockMeal(scope.repo.now());
      _c = HallController(scope.repo, place)
        ..addListener(_onData)
        ..load(_day);
      _syncStatus();
      _pendingLand = widget.landOn;
      _pendingDish = widget.dish;
      _plate = scope.plate..addListener(_onPlate);
    }
  }

  @override
  void dispose() {
    _sc.removeListener(_onScroll);
    _sc.dispose();
    _scrollY.dispose();
    _arrive.dispose();
    _dayFade.dispose();
    _flash.dispose();
    _plate?.removeListener(_onPlate);
    _c?.removeListener(_onData);
    _c?.dispose();
    _jumpC.dispose();
    _station.dispose();
    _status.dispose();
    _late.dispose();
    _busy.dispose();
    super.dispose();
  }

  void _syncStatus() {
    // busy is live: today's, and only while the reading is
    final before = _busy.value;
    final r = _day == 0 ? c.busy : null;
    if (!identical(r, _busyRead)) {
      _busyRead = r;
      _busy.value = r == null ? null : HallBusyView.of(r, span: c.placeHours == null ? null : openSpan(c.placeHours!));
    }
    if (r == null && _day == 0 && widget.seedBusy != null && _busy.value?.seed != true) _busy.value = HallBusyView.seed(lamps: widget.seedBusy!.lamps, word: widget.seedBusy!.word, hasExtra: widget.seedBusy!.extra);
    _syncBlock(before);
    final h = c.placeHours;
    final iso = _iso;
    // hours are not known until they arrive; another day's span only with its menu
    _status.value = h == null && _day == 0 ? widget.seedStatus ?? '' : h == null || (_day > 0 && c.state(_day) != MenuState.ok) || !fx.hours.containsKey(place) || iso.isEmpty ? '' : statusLine(fx, place, _day);
  }

  /// The block follows the view: none until a reading (or the card's) is there, then its lines; other days and offline keep what is held.
  /// The header opens at the height it will keep if the block is already known (the card's reading, with or without its second line) and
  /// otherwise as if it will have both lines: the title stays where it is when the block lands, whichever it turns out to be.
  void _syncBlock(HallBusyView? before) {
    final v = _busy.value, to = v?.block ?? _blockTo;
    if (!_synced) {
      _synced = true;
      _blockFrom = _blockTo = _seenBlock = to;
      // no card: what Halls (or any earlier read) found for this hall; with none at all, a hall with a second line
      final known = _cafe || v != null ? null : AppScope.of(context).repo.lastBusy.entries.where((e) => hallKeyOfTitle(e.key) == place).firstOrNull?.value;
      // ponytail: a cold deep link has no earlier read, so a live hall without a second line ends 22 dp shorter than M2's
      _h0 = _cafe ? 0 : headerHeight(widget.top) - (v?.block ?? (known == null ? M2Layout.busyBlockExtra : HallBusyView.of(known).block));
      return;
    }
    if (v == null || (identical(v, before))) return;
    final lands = !v.seed && (before == null || before.seed);
    if (to == _blockTo && !lands) return;
    final rm = reducedMotion(context);
    _blockFrom = _block;
    _blockTo = to;
    _lateGrows = to != _blockFrom;
    _late
      ..duration = rm ? M2Motion.rmFade.duration : M2Motion.settle.duration
      ..forward(from: 0);
  }

  /// The data moved: a menu that was not showing is now, and arrives; anything else just redraws.
  void _onData() {
    if (!mounted) return;
    if (_seen != MenuState.ok && _state == MenuState.ok) {
      final a = resolveAnim(context, M2Motion.settle);
      _arrive
        ..duration = a.duration
        ..value = 0
        ..animateTo(1, curve: a.curve);
    }
    _syncStatus();
    setState(() {});
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _updateStation(); // the station the new rows start at
      if (_day == 0 && _state == MenuState.ok) _syncFront();
      _land();
    });
  }

  /// The menu is in: land on the dish a where-served tap named, and open the sheet a launch route named.
  void _land() {
    if (_state != MenuState.ok) return;
    final land = _pendingLand, name = _pendingDish;
    _pendingLand = _pendingDish = null;
    if (land != null) _bring(land, instant: true);
    final d = name == null ? null : _find(dishKey(name), _effectiveMeal);
    if (d != null) _openDish(d);
  }

  MenuItem? _find(String key, String meal) {
    for (final s in fx.days[_iso]?[place]?[meal] ?? const <Station>[]) {
      for (final d in s.dishes) {
        if (d.key == key) return d;
      }
    }
    return null;
  }

  void _openDish(MenuItem d) => openDishSheet(
        context, dish: d, place: place, meal: _effectiveMeal, day: _day, fx: fx, avoid: _prefs.avoid, cafeIds: c.cafeIds, onServe: (p, g) => _serve(d, p, g),
      );

  void _openSyn(Syn y) {
    final spec = BowlSpec.syn(y);
    openDishSheet(
      context, dish: spec.parts.first, place: place, meal: _effectiveMeal, day: _day, fx: fx, avoid: _prefs.avoid, cafeIds: c.cafeIds, build: spec,
      onServe: (p, g) {},
    );
  }

  /// A where-served tap, with the sheet half-way out: the place and day already showing bring the dish up where it is (revealed first
  /// if your preferences hide it); any other pushes that place at that day and meal, already at the dish.
  void _serve(MenuItem d, String p, WhereGroup g) {
    if (!mounted) return;
    if (p == place && g.day == _day) {
      _bring(d.key, meal: g.meal);
    } else {
      ShellScope.of(context).openPlace(p, meal: g.meal, day: g.day, dish: d.key);
    }
  }

  /// M2 `toDish`: tint the serving and scroll it to just under the pinned rows, on its meal.
  void _bring(String key, {String? meal, bool instant = false}) {
    final m = meal ?? _effectiveMeal, d = _find(key, m);
    if (d == null) return;
    if (m != _effectiveMeal) _switchMeal(m);
    if (!prefOK(_prefs, d)) _reveal = true;
    setState(() => _here = null);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final i = _items.indexWhere((x) => x.kind == ItemKind.dish && x.holds(key));
      if (i < 0) return;
      setState(() => _here = _items[i].id);
      WidgetsBinding.instance.addPostFrameCallback((_) => mounted && _sc.hasClients ? _scrollTo(_keys.dish, i, lead: M2Layout.hereLead, instant: instant) : null);
    });
  }

  void _onPlate() {
    if (mounted) setState(() {});
  }

  // ---- scroll
  void _onScroll() {
    if (!_sc.hasClients) return;
    final d = _sc.offset.clamp(0.0, _r);
    if (d != _scrollY.value) _scrollY.value = d;
    _updateStation();
  }

  /// Where a built row's top is in the scroll's own coordinates (what scrolling there would put at the top), or null while it is not
  /// built: the list is lazy.
  double? _topOf(GlobalKey k) {
    final box = k.currentContext?.findRenderObject();
    final sliver = _listKey.currentContext?.findRenderObject();
    if (box == null || !box.attached || sliver is! RenderSliverMultiBoxAdaptor) return null;
    // the sliver's own child that holds the row: its layout offset in the sliver, and the sliver starts after the header's room.
    // (Read from the parent data, not by asking the box to reveal itself, which reads its size in the middle of a layout.)
    RenderObject cur = box;
    while (cur.parent != null && cur.parent != sliver) {
      cur = cur.parent!;
    }
    if (cur.parent != sliver) return null;
    return _hh + _th + _sw + ((cur.parentData! as SliverMultiBoxAdaptorParentData).layoutOffset ?? 0);
  }

  /// A guess at an item's offset from the typical heights, for the rows not built yet (a head 50, a dish 64 or 79, a note 53).
  double _estimate(int index) {
    var y = _hh + _th + _sw;
    for (var i = 0; i < index && i < _items.length; i++) {
      final it = _items[i];
      y += switch (it.kind) { ItemKind.head => M2Size.stationRow, ItemKind.syn => M2Size.row, ItemKind.dish => it.title.length > 26 ? M2Layout.rowTall : M2Size.row, _ => M2Layout.noteRow };
    }
    return y;
  }

  /// M2 `curStation`: the last station whose head has reached the line under the pinned rows. Heads that are not built are far
  /// enough off that the first built row's station is the answer when no built head is above the line.
  void _updateStation() {
    if (_items.isEmpty || !_sc.hasClients) return;
    final heads = _items.where((i) => i.kind == ItemKind.head).map((i) => i.si).toList();
    if (heads.isEmpty) {
      if (_station.value != null) _station.value = null;
      return;
    }
    final y = _sc.offset + _pin + 2;
    int? cur;
    for (final si in heads) {
      final top = _keys.stations[si] == null ? null : _topOf(_keys.stations[si]!);
      if (top != null && top <= y) cur = si;
    }
    if (cur == null) {
      final ro = _listKey.currentContext?.findRenderObject();
      var fi = 0;
      if (ro is RenderSliverMultiBoxAdaptor && ro.firstChild != null) fi = ro.indexOf(ro.firstChild!);
      var s = heads.first;
      for (var i = 0; i <= fi && i < _items.length; i++) {
        if (_items[i].kind == ItemKind.head) s = _items[i].si;
      }
      cur = _items.indexWhere((i) => i.kind == ItemKind.head && i.si == s) > fi ? heads.first : s;
    }
    if (cur != _station.value) _station.value = cur;
  }

  /// A copy of the rows on screen, drawn where they are, for the meal change's outgoing list.
  Widget? _captureGhost() {
    final ro = _listKey.currentContext?.findRenderObject();
    if (ro is! RenderSliverMultiBoxAdaptor || ro.firstChild == null || !_sc.hasClients) return null;
    final first = ro.firstChild!, fi = ro.indexOf(first), lo = (first.parentData! as SliverMultiBoxAdaptorParentData).layoutOffset ?? 0;
    final scope = AppScope.of(context), a = _actions, plate = scope.plate.state;
    return Stack(children: [
      Positioned(
        left: 0, right: 0, top: _hh + _th + _sw + lo - _sc.offset,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = fi; i < _items.length && i < fi + M2Layout.ghostRows; i++)
            buildItem(context, _items[i], fx: fx, plate: plate, scores: scope.prefs.scores, place: place, day: _day, meal: _effectiveMeal, reveal: _reveal, keys: null, actions: a, favorites: scope.prefs.favorites, here: _here, track: scope.prefs.track),
        ]),
      ),
    ]);
  }

  /// M2 `syncFront`: the plate bar's front plate follows the meal and place the menu shows.
  void _syncFront() {
    final plates = AppScope.of(context).plate, m = plateMeal(fx, place, _effectiveMeal, fx.clock);
    final i = plates.state.plates.indexWhere((pl) => pl.meal == m && (plateHalls(pl) ?? [place]).contains(place));
    if (i >= 0) plates.setFront(i);
  }

  /// The meal showing: the chosen one if the day has it, else M2's default (the clock's, all day, the first).
  String get _effectiveMeal {
    final ms = _state == MenuState.ok && _dishMenu ? mealsOf(fx, _iso, place) : const <String>[];
    return ms.isNotEmpty && !ms.contains(_meal) ? defaultMeal(fx, _iso, place, _meal) : _meal;
  }

  // ---- meal tabs: shared axis
  void _switchMeal(String meal) {
    final ms = mealsOf(fx, _iso, place), from = ms.indexOf(_effectiveMeal), to = ms.indexOf(meal);
    if (to < 0 || to == from) return;
    if (_sc.hasClients && _sc.offset > _r) _sc.jumpTo(_r);
    Haptics.selection();
    final ghost = _captureGhost();
    _pagerKey.currentState?.run((to - from).sign, ghost);
    setState(() {
      _meal = meal;
      _here = null;
    });
    if (_day == 0) _syncFront();
    WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _updateStation() : null);
  }

  // ---- day change: fade through. Everything that says the day fades out where it is over the first 35%, the new day is drawn and
  // fades in where it ends up (the list from .97); old and new never overlap, the grounds stay, the header never moves.
  Future<void> changeDay(int i) async {
    if (i == _day) return;
    final rm = reducedMotion(context), f = M2Motion.fadeThrough;
    void swap() {
      final y = _sc.hasClients ? _sc.offset.clamp(0.0, _r) : 0.0;
      c.load(i);
      setState(() => _day = i);
      _syncStatus();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (_sc.hasClients) _sc.jumpTo(y.clamp(0.0, _sc.position.maxScrollExtent));
        _updateStation();
        if (i == 0 && _state == MenuState.ok) _syncFront();
      });
    }

    if (rm) {
      swap();
      _dayIn = true;
      _dayFade.duration = M2Motion.rmFade.duration;
      await _dayFade.forward(from: 0);
      _dayIn = false;
      return;
    }
    _dayIn = false;
    _dayFade.duration = f.duration * M2Motion.sharedXAt;
    await _dayFade.animateBack(0, curve: M2Motion.fadeThroughOut.curve); // out: linear to nothing
    if (!mounted) return;
    swap();
    _dayIn = true;
    _dayFade.duration = f.duration - f.duration * M2Motion.sharedXAt;
    await _dayFade.animateTo(1, curve: f.curve);
    _dayIn = false;
  }

  // ---- the schedule: the status line's and the day cell's one sheet
  void _openSchedule() {
    if (!fx.hours.containsKey(place) || iso0.isEmpty) return;
    Haptics.selection();
    c.loadAll();
    ShellScope.of(context).pushSheet((h, done) => ScheduleSheet(
          handle: h, top: widget.top + M2Layout.sheetTop, data: c, onClosed: done,
          schedule: () => schedule(c.board, place, _day, modeOf: c.netOf),
          onEvent: (i) => h.away(() => widget.onEvent?.call(i)),
          onPick: (i) {
            if (i == _day) {
              h.close();
              return;
            }
            Haptics.selection();
            h.away(() => changeDay(i));
          },
        ));
  }

  // ---- stations
  void _openStations() {
    if (_stationsSheet != null) {
      _stationsSheet!.close();
      return;
    }
    final meal = _effectiveMeal, menu = fx.days[_iso]?[place]?[meal];
    if (menu == null || _station.value == null) return;
    Haptics.selection();
    final view = menuView(fx, _iso, place, meal, _prefs, _reveal);
    final stations = [for (final s in view.sections) (name: s.name, count: s.dishes.length, si: menu.indexWhere((x) => x.name == s.name))];
    _stationsSheet = ShellScope.of(context).pushSheet((h, done) => StationSheet(
          handle: h, top: widget.top + M2Layout.sheetTop, title: '${c.name} ${meal == 'grab' ? "Grab 'N Go" : mealLabel[meal]!.toLowerCase()}${_day > 0 ? ', ${dayCell(fx, _day)}' : ''}',
          stations: [for (final s in stations) (s.name, s.count)], current: stations.indexWhere((s) => s.si == _station.value).clamp(0, 1 << 20),
          onPick: (i) => _jump(stations[i].si, h),
          onClosed: () {
            _stationsSheet = null;
            if (mounted) setState(() {});
            done();
          },
        ));
    setState(() {});
  }

  void _jump(int si, SheetHandle h) {
    h.close();
    if (!_sc.hasClients) return;
    Haptics.selection();
    final i = _items.indexWhere((x) => x.kind == ItemKind.head && x.si == si);
    if (i < 0) return;
    _scrollTo(_keys.station(si), i);
  }

  /// Scrolls item `i` (whose row is `key`) to just under the pinned rows, `lead` clear of them: the row's exact offset once it is
  /// built, until then the estimate, which the walk toward it corrects as rows are built.
  void _scrollTo(GlobalKey key, int i, {double lead = 0, bool instant = false}) {
    double target() => ((_topOf(key) ?? _estimate(i)) - _pin - lead).clamp(0.0, _sc.position.maxScrollExtent);
    if (instant || reducedMotion(context)) {
      _sc.jumpTo(target());
      WidgetsBinding.instance.addPostFrameCallback((_) => mounted && _sc.hasClients ? _sc.jumpTo(target()) : null);
      return;
    }
    final a = M2Motion.scroll, y0 = _sc.offset;
    _jumpC
      ..stop()
      ..duration = a.duration
      ..value = 0;
    void tick() => _sc.jumpTo(y0 + (target() - y0) * a.curve.transform(_jumpC.value));
    _jumpC.addListener(tick);
    _jumpC.forward().whenComplete(() {
      _jumpC.removeListener(tick);
      if (mounted && _sc.hasClients) _sc.jumpTo(target());
    });
  }

  // ---- rows
  MealActions get _actions {
    final plate = AppScope.of(context).plate;
    String pm() => plateMeal(fx, place, _effectiveMeal, fx.clock);
    return MealActions(
      onSyn: (si) {
        final y = synOf(fx, _iso, place, _effectiveMeal, si);
        if (y != null) _openSyn(y);
      },
      onOpen: (d) => widget.onOpenDish != null ? widget.onOpenDish!(d, place: place, meal: _effectiveMeal, day: _day) : _openDish(d),
      onAdd: (d) {
        plate.add(pm(), shownOf(familiesOf(fx), d), {place: d}, null, d.key);
        Haptics.add();
      },
      onInc: (d) {
        final f = findItem(plate.state, pm(), d.key, place);
        if (f != null) {
          plate.step(f.plate.id, d.key, 1);
          Haptics.add();
        }
      },
      onDec: (d) {
        final f = findItem(plate.state, pm(), d.key, place);
        if (f != null) {
          plate.step(f.plate.id, d.key, -1);
          Haptics.remove();
        }
      },
      onRetry: () {
        Haptics.light();
        c.retry(_day);
      },
      onEvent: (i) => widget.onEvent?.call(i),
      onReveal: (on) {
        Haptics.selection();
        setState(() => _reveal = on);
        final a = resolveAnim(context, M2Motion.settle);
        _flash
          ..duration = a.duration
          ..value = M2Motion.revealFlash
          ..animateTo(1, curve: a.curve);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final top = widget.top, hh = _hh, th = _th, sw = _sw, h = widget.height, scope = AppScope.of(context);
    final p = widget.progress, st = _state, ok = st == MenuState.ok, menuOpen = _dishMenu;
    final meals = menuOpen && ok ? mealsOf(fx, _iso, place) : const <String>[];
    final meal = _effectiveMeal, spacer = hh + th + sw, tail = M2Layout.listFoot + safeBottom(context);
    _seen = st;
    _items = menuOpen ? mealItems(fx, _prefs, place, c.name, _day, meal, _reveal, state: st, track: AppScope.of(context).prefs.track) : const [];
    final wrap = widget.dragWrap ?? (Widget c) => c;
    final fade = _FadeProduct(p, _dayFade, _arrive);
    return ColoredBox(
      color: M2Color.chalk,
      child: Stack(children: [
        // the list: the header's room above it, then the day's meal
        Positioned.fill(
          child: AnimatedBuilder(
            animation: Listenable.merge([p, _arrive, _dayFade, _flash]),
            builder: (_, c) => ChalkFade(
              key: const ValueKey('fade-list'), opacity: (incomingOpacity(p.value) * _arrive.value * _dayFade.value * _flash.value).clamp(0.0, 1.0),
              child: Transform.scale(
                key: const ValueKey('day-scale'), alignment: Alignment(0, (_pin + (h - _pin) / 2) / h * 2 - 1),
                scale: _dayIn && !reducedMotion(context) ? M2Motion.fadeThroughScale + (1 - M2Motion.fadeThroughScale) * _dayFade.value : 1.0, child: c,
              ),
            ),
            child: SharedAxisLayer(
              key: _pagerKey,
              child: CustomScrollView(
                controller: _sc, physics: const ClampingScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(child: wrap(SizedBox(height: spacer))),
                  if (_cafe && !_dishMenu) SliverToBoxAdapter(child: wrap(_standing())),
                  if (_items.isNotEmpty)
                    ListenableBuilder(
                      listenable: Listenable.merge([scope.plate, scope.prefs]),
                      builder: (_, _) => MealSliver(
                        sliverKey: _listKey, fx: fx, items: _items, plate: scope.plate.state, scores: scope.prefs.scores, place: place, day: _day, meal: meal, reveal: _reveal,
                        keys: _keys, actions: _actions, dragWrap: widget.dragWrap, favorites: scope.prefs.favorites, here: _here, track: scope.prefs.track,
                      ),
                    ),
                  // the list is at least a screen (`#mlist{min-height:100%}`) and then the room that clears the plate bar
                  SliverLayoutBuilder(builder: (_, c) => SliverToBoxAdapter(child: wrap(SizedBox(height: tail + math.max(0.0, h + spacer - c.precedingScrollExtent))))),
                ],
              ),
            ),
          ),
        ),
        // the header scrolls away under the pinned rows; the rows ride it up until the compact bar
        Positioned(
          left: 0, right: 0, top: 0, height: hh + th + sw,
          child: ValueListenableBuilder<double>(
            valueListenable: _scrollY,
            builder: (_, d, _) => Transform.translate(
              offset: Offset(0, -d),
              child: Stack(clipBehavior: Clip.none, children: [
                HallHeader(
                  key: const ValueKey('header'), place: place, name: c.name, top: top, status: _status, busy: _busy, progress: p, scroll: _scrollY, dayFade: _dayFade, band: widget.band,
                  hh: hh, block: _cafe ? null : _block, lateK: _late, lateGrows: _lateGrows,
                  ghost: widget.ghost, parts: widget.parts, onStatus: _status.value.isEmpty ? null : _openSchedule,
                ),
                if (th > 0)
                  Positioned(
                    left: 0, right: 0, top: hh, height: th,
                    child: MealTabs(key: ValueKey('tabs-$place'), meals: meals, selected: meal, fade: fade, onTap: _switchMeal),
                  ),
                if (sw > 0)
                  Positioned(
                    left: 0, right: 0, top: hh + th, height: sw,
                    child: ValueListenableBuilder<int?>(
                      valueListenable: _station,
                      builder: (_, _, _) => StationRow(
                        fade: fade, name: ok ? _stationName(meal) : '', dayLabel: dayCell(fx, _day), open: _stationsSheet != null,
                        topRule: th > 0, onStations: _openStations, onDay: _openSchedule,
                      ),
                    ),
                  ),
              ]),
            ),
          ),
        ),
        // back: fixed, over everything
        Positioned(
          left: M2Layout.backLeft, top: top, height: M2Layout.barH,
          child: AnimatedBuilder(
            animation: p,
            builder: (_, c) => Opacity(key: const ValueKey('fade-back'), opacity: incomingOpacity(p.value).clamp(0.0, 1.0), child: c),
            child: Center(child: BackButton(onTap: widget.onBack)),
          ),
        ),
        if (_cafe)
          Positioned(
            right: M2Layout.backLeft, top: top, height: M2Layout.barH,
            child: AnimatedBuilder(
              animation: p,
              builder: (_, c) => Opacity(opacity: incomingOpacity(p.value).clamp(0.0, 1.0), child: c),
              child: Center(
                child: ListenableBuilder(
                  listenable: scope.prefs,
                  builder: (_, _) {
                    final name = c.name, pins = scope.prefs.pins, on = pins.contains(name);
                    return PinButton(pinned: on, onTap: () {
                      on ? Haptics.selection() : Haptics.light();
                      scope.prefs.setPins(on ? [for (final n in pins) if (n != name) n] : [...pins, name]);
                    });
                  },
                ),
              ),
            ),
          ),
      ]),
    );
  }

  /// A café that posts no dishes: its description, then what it lists (names, PDFs, or nothing).
  Widget _standing() {
    final loc = c.cafeLoc, table = Roster.table.cafes, from = c.roster?.cafes ?? table;
    final place = from.where((p) => p.key == this.place).firstOrNull ?? table.firstWhere((p) => p.key == this.place);
    final menu = loc == null ? null : resolveCafeMenu(const [], loc);
    return CafeStandingBody(kind: menu == null ? const NoMenuBody() : cafeBody(menu), place: place, pdfRows: (_, pdf) => PdfRows(pdf: pdf, offline: c.offline, top: widget.top));
  }

  String _stationName(String meal) {
    final menu = fx.days[_iso]?[place]?[meal];
    final si = _station.value;
    return menu == null || si == null || si >= menu.length ? '' : menu[si].name;
  }
}

/// Three animations multiplied: the container's incoming fade, the day change's and the menu arriving's.
class _FadeProduct extends Animation<double> with AnimationLocalListenersMixin, AnimationLocalStatusListenersMixin {
  _FadeProduct(this.p, this.day, this.arrive);
  final Animation<double> p, day, arrive;
  @override
  double get value => (incomingOpacity(p.value) * day.value * arrive.value).clamp(0.0, 1.0);
  @override
  AnimationStatus get status => AnimationStatus.forward;
  @override
  void didRegisterListener() {
    p.addListener(notifyListeners);
    day.addListener(notifyListeners);
    arrive.addListener(notifyListeners);
  }

  @override
  void didUnregisterListener() {
    p.removeListener(notifyListeners);
    day.removeListener(notifyListeners);
    arrive.removeListener(notifyListeners);
  }
}

/// `opacity` of `child` over the chalk ground, drawn as a chalk veil of the remaining alpha over it instead of an `Opacity`: the same
/// pixels (the screen's ground is chalk), without compositing the whole scroll view into an offscreen texture on every frame of the
/// container transform.
class ChalkFade extends StatelessWidget {
  const ChalkFade({super.key, required this.opacity, required this.child});
  final double opacity;
  final Widget child;
  @override
  Widget build(BuildContext context) => opacity >= 1
      ? child
      : Stack(fit: StackFit.passthrough, children: [
          child,
          if (opacity > 0) Positioned.fill(child: IgnorePointer(child: ColoredBox(color: M2Color.chalk.withValues(alpha: 1 - opacity)))) else Positioned.fill(child: IgnorePointer(child: ColoredBox(color: M2Color.chalk))),
        ]);
}
