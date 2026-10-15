import 'dart:math' as math;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/menu_view.dart';
import '../../core/m2/plate.dart';
import '../../core/hours.dart' show openSpan;
import '../../core/occupancy.dart';
import '../../core/m2/places.dart' show Roster;
import '../../core/m2/schedule.dart' show statusLine;
import '../../data/repository.dart' show resolveCafeMenu;
import '../cafes/cafe_body.dart';
import '../cafes/cafes_model.dart' show NoMenuBody, cafeBody;
import '../../motion/container_math.dart';
import '../../motion/container_transform.dart';
import '../../shell/app_scope.dart';
import '../../shell/plate_model.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'hall_controller.dart';
import 'hall_header.dart';
import 'busy.dart';
import 'meal_list.dart';
import 'meal_pager.dart';
import 'meal_tabs.dart';
import 'station_switcher.dart';

/// A dish row's tap, for the dish sheet (`flutter-port-dish-and-plate`): the serving that was tapped, the place and meal it is on
/// and the day showing (an index into the 15, 0 today).
typedef DishTap = void Function(MenuItem dish, {required String place, required String meal, required int day});

/// The hall screen (M2 `#menu`): the header over the photo, the meal tabs and the station row pinned under it, and the list. One
/// `progress` (the container transform's open; whole at rest and when pushed) and the scroll offset drive every animated property,
/// as M2's `paint(p, y)`. A hall and a café with dishes alike (a café has no letter and no busy row); it is the whole body a café page
/// hosts. `place` is `W F H B` or `c<i>`; the body loads its own hours and menus from the app's repository.
///
/// Hooks for what comes next: `onStatus` and `onDay` (the schedule and the day control), `onOpenDish`, `onEvent`.
class HallMenu extends StatefulWidget {
  final String place;
  final double top, height;
  final Animation<double> progress;
  final BandRect? band;
  /// the band's own copy, drawn over the photo while the container opens
  final Widget? ghost;
  /// an index into the 15 days (0 today); `meal` is M2's key (`lunch`, `late`, `grab`), kept if the day has it
  final int day;
  final String? meal;
  final VoidCallback onBack;
  final VoidCallback? onStatus, onDay;
  final DishTap? onOpenDish;
  final ValueChanged<int>? onEvent;
  /// Wraps the scrolling list in the container's back-drag recogniser, a descendant of the scroll view so that, at the top, a drag
  /// down is claimed before the list's own (M2 decides the axis itself, on its first move).
  final Widget Function(Widget child)? dragWrap;
  const HallMenu({
    super.key, required this.place, required this.top, required this.height, this.progress = kAlwaysCompleteAnimation, this.band, this.ghost,
    this.day = 0, this.meal, required this.onBack, this.onStatus, this.onDay, this.onOpenDish, this.onEvent, this.dragWrap,
  });
  @override
  State<HallMenu> createState() => HallMenuState();
}

class HallMenuState extends State<HallMenu> with TickerProviderStateMixin {
  late final int _day = widget.day; // Task 2 (the day control) changes it
  late String _meal;
  PlateModel? _plate;
  bool _reveal = false;
  HallController? _c;
  final _sc = ScrollController();
  final _scrollY = ValueNotifier<double>(0);
  // M2 `arrive()`: when a menu that was loading or failed lands, tabs, station name and list fade in from nothing over `settle`
  late final AnimationController _arrive = AnimationController(vsync: this, value: 1, duration: M2Motion.settle.duration);
  MenuState _seen = MenuState.ok;
  final _status = ValueNotifier<String>('');
  final _busy = ValueNotifier<HallBusyView?>(null);
  OccupancyRead? _busyRead;
  final _keys = ListKeys();
  final _listKey = GlobalKey(), _pagerKey = GlobalKey<SharedAxisLayerState>();
  List<ListItem> _items = const [];
  late final AnimationController _jumpC = AnimationController(vsync: this);
  final _station = ValueNotifier<int?>(null);
  SheetHandle? _stationsSheet;
  // the dietary preferences (Task 2 reads them from You); nothing is hidden until then
  final Prefs _prefs = noPrefs;

  String get place => widget.place;
  HallController get c => _c!;
  Board get fx => c.board;
  bool get _cafe => isCafe(place);
  String get _iso => c.isos[_day];
  bool get _dishMenu => c.hasMenu;
  MenuState get _state => _dishMenu ? c.state(_day) : MenuState.ok;
  // a café that posts one menu a day has no tab row (its day cell leads the station row), once its menu is known
  bool get _oneMeal => _cafe && _dishMenu && _state == MenuState.ok && isOneMeal(fx, place);
  double get _th => (_cafe && !_dishMenu) || _oneMeal ? 0 : M2Layout.stationRowH;
  double get _sw => _cafe && !_dishMenu ? 0 : M2Layout.stationRowH;
  double get _hh => headerHeight(widget.top);
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
      _plate = scope.plate..addListener(_onPlate);
    }
  }

  @override
  void dispose() {
    _sc.removeListener(_onScroll);
    _sc.dispose();
    _scrollY.dispose();
    _arrive.dispose();
    _plate?.removeListener(_onPlate);
    _c?.removeListener(_onData);
    _c?.dispose();
    _jumpC.dispose();
    _station.dispose();
    _status.dispose();
    _busy.dispose();
    super.dispose();
  }

  void _syncStatus() {
    // busy is live: today's, and only while the reading is
    final r = _day == 0 ? c.busy : null;
    if (!identical(r, _busyRead)) {
      _busyRead = r;
      _busy.value = r == null ? null : HallBusyView.of(r, span: c.placeHours == null ? null : openSpan(c.placeHours!));
    }
    final h = c.placeHours;
    final iso = _iso;
    // hours are not known until they arrive; another day's span only with its menu
    _status.value = h == null || (_day > 0 && c.state(_day) != MenuState.ok) || !fx.hours.containsKey(place) || iso.isEmpty ? '' : statusLine(fx, place, _day);
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
      y += switch (it.kind) { ItemKind.head => M2Size.stationRow, ItemKind.dish => it.dish!.dishName.length > 26 ? M2Layout.rowTall : M2Size.row, _ => M2Layout.noteRow };
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
            buildItem(context, _items[i], fx: fx, plate: plate, scores: scope.prefs.scores, place: place, day: _day, meal: _effectiveMeal, reveal: _reveal, keys: null, actions: a),
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
    setState(() => _meal = meal);
    if (_day == 0) _syncFront();
    WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _updateStation() : null);
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
    // the head's exact offset once it is built; until then the estimate, which the walk toward it corrects as rows are built
    double target() => ((_topOf(_keys.station(si)) ?? _estimate(i)) - _pin).clamp(0.0, _sc.position.maxScrollExtent);
    if (reducedMotion(context)) {
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
      onOpen: (d) => widget.onOpenDish?.call(d, place: place, meal: _effectiveMeal, day: _day),
      onAdd: (d) {
        plate.add(pm(), d.dishName, {place: d});
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
    _items = menuOpen ? mealItems(fx, _prefs, place, c.name, _day, meal, _reveal, state: st) : const [];
    final wrap = widget.dragWrap ?? (Widget c) => c;
    final fade = _FadeProduct(p, _arrive);
    return ColoredBox(
      color: M2Color.chalk,
      child: Stack(children: [
        // the list: the header's room above it, then the day's meal
        Positioned.fill(
          child: AnimatedBuilder(
            animation: Listenable.merge([p, _arrive]),
            builder: (_, c) => Opacity(key: const ValueKey('fade-list'), opacity: (incomingOpacity(p.value) * _arrive.value).clamp(0.0, 1.0), child: c),
            child: SharedAxisLayer(
              key: _pagerKey,
              child: CustomScrollView(
                controller: _sc, physics: const ClampingScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(child: wrap(SizedBox(height: spacer))),
                  if (_cafe && !_dishMenu) SliverToBoxAdapter(child: wrap(_standing())),
                  if (_items.isNotEmpty)
                    ListenableBuilder(
                      listenable: scope.plate,
                      builder: (_, _) => MealSliver(
                        sliverKey: _listKey, fx: fx, items: _items, plate: scope.plate.state, scores: scope.prefs.scores, place: place, day: _day, meal: meal, reveal: _reveal,
                        keys: _keys, actions: _actions, dragWrap: widget.dragWrap,
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
                  key: const ValueKey('header'), place: place, name: c.name, top: top, status: _status, busy: _busy, progress: p, scroll: _scrollY, dayFade: kAlwaysCompleteAnimation, band: widget.band,
                  ghost: widget.ghost, onStatus: widget.onStatus == null || _status.value.isEmpty ? null : widget.onStatus,
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
                        topRule: th > 0, onStations: _openStations, onDay: widget.onDay,
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
    return CafeStandingBody(kind: menu == null ? const NoMenuBody() : cafeBody(menu), place: place);
  }

  String _stationName(String meal) {
    final menu = fx.days[_iso]?[place]?[meal];
    final si = _station.value;
    return menu == null || si == null || si >= menu.length ? '' : menu[si].name;
  }
}

/// Two animations multiplied: the container's incoming fade and the menu arriving's.
class _FadeProduct extends Animation<double> with AnimationLocalListenersMixin, AnimationLocalStatusListenersMixin {
  _FadeProduct(this.p, this.arrive);
  final Animation<double> p, arrive;
  @override
  double get value => (incomingOpacity(p.value) * arrive.value).clamp(0.0, 1.0);
  @override
  AnimationStatus get status => AnimationStatus.forward;
  @override
  void didRegisterListener() {
    p.addListener(notifyListeners);
    arrive.addListener(notifyListeners);
  }

  @override
  void didUnregisterListener() {
    p.removeListener(notifyListeners);
    arrive.removeListener(notifyListeners);
  }
}
