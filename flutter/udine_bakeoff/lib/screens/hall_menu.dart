import 'dart:math' as math;
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import '../logic/fixture.dart';
import '../logic/menu_view.dart';
import '../logic/plate.dart';
import '../motion/container_math.dart';
import '../motion/container_transform.dart';
import '../logic/net.dart';
import '../shell_api.dart';
import '../state/net.dart';
import '../state/store.dart';
import '../theme/tokens.dart';
import '../ui/landing_scroll.dart';
import '../ui/ui.dart';
import 'event_page.dart';
import 'hall_header.dart';
import 'hours_sheet.dart';
import 'meal_list.dart';
import 'meal_pager.dart';
import 'meal_tabs.dart';
import 'station_switcher.dart';

/// The hall screen (M2 `#menu`): the header over the photo, the meal tabs and the station row pinned under it, and the list. One
/// `progress` (the container transform's open; whole at rest and when pushed) and the scroll offset drive every animated property,
/// as M2's `paint(p, y)`. Hall and café alike; a place with no dish menu has no pinned rows.
class HallMenu extends StatefulWidget {
  final Fixture fx;
  final String place;
  final double top, height;
  final Animation<double> progress;
  final BandRect? band;
  final bool bandOpen;
  final int day;
  final String? meal;
  /// arrive already at this serving (a where-served push)
  final HallTarget? land;
  final VoidCallback onBack;
  /// Wraps the scrolling list in the container's back-drag recogniser, a descendant of the scroll view so that, at the top, a drag
  /// down is claimed before the list's own (M2 decides the axis itself, on its first move).
  final Widget Function(Widget child)? dragWrap;
  const HallMenu({
    super.key, required this.fx, required this.place, required this.top, required this.height, this.progress = kAlwaysCompleteAnimation, this.band, this.bandOpen = true,
    this.day = 0, this.meal, this.land, required this.onBack, this.dragWrap,
  });
  @override
  State<HallMenu> createState() => HallMenuState();
}

class HallMenuState extends State<HallMenu> with TickerProviderStateMixin {
  late int _day = widget.land?.day ?? widget.day;
  late String _meal;
  bool _reveal = false;
  String? _here;
  late final LandingScrollController _sc = LandingScrollController(landing: _landing);
  final _scrollY = ValueNotifier<double>(0);
  late final AnimationController _dayFade = AnimationController(vsync: this, value: 1);
  // M2 `arrive()`: when a menu that was loading or failed lands, tabs, station name and list fade in from nothing over `settle`
  late final AnimationController _arrive = AnimationController(vsync: this, value: 1, duration: M2Motion.settle.duration);
  Net? _net;
  late final Net _ok = Net(fx);
  String? _seenKey;
  MenuState _seen = MenuState.ok;
  bool _dayIn = false;
  late final _dayN = ValueNotifier<int>(widget.land?.day ?? widget.day);
  Widget? _header;
  bool? _headerOpen;
  final _keys = ListKeys();
  final _listKey = GlobalKey(), _pagerKey = GlobalKey<SharedAxisLayerState>();
  List<ListItem> _items = const [];
  late final AnimationController _jumpC = AnimationController(vsync: this);
  final _station = ValueNotifier<int?>(null);
  SheetHandle? _stationsSheet;

  Fixture get fx => widget.fx;
  String get place => widget.place;
  bool get _cafe => isCafe(place);
  String get _iso => dayIsos(fx)[_day];
  bool get _dishMenu => hasMenu(fx, place);
  bool get _oneMeal => isOneMeal(fx, place);
  double get _th => (_cafe && !_dishMenu) || (_oneMeal && _dishMenu) ? 0 : M2Layout.stationRowH;
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
    final iso = dayIsos(fx)[_day];
    _meal = defaultMeal(fx, iso, place, widget.land?.meal ?? widget.meal ?? 'lunch');
    final land = widget.land;
    if (land != null) {
      final menu = fx.days[iso]?[place]?[_meal], store = StoreScope.read(context);
      for (var si = 0; menu != null && si < menu.length && _here == null; si++) {
        final d = menu[si].dishes.where((x) => x.key == land.dishKey).firstOrNull;
        if (d != null) {
          _here = '$si.${d.key}';
          _reveal = !prefOK(store.prefs, d); // arriving at a dish your preferences hide: the list opens revealed, the row marked
        }
      }
    }
    _sc.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _updateStation();
      if (_day == 0) _syncFront();
    });
  }

  @override
  void dispose() {
    _sc.removeListener(_onScroll);
    _sc.dispose();
    _scrollY.dispose();
    _dayFade.dispose();
    _arrive.dispose();
    _net?.removeListener(_onNet);
    _jumpC.dispose();
    _dayN.dispose();
    _station.dispose();
    super.dispose();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final n = NetScope.maybeOf(context) ?? _ok;
    if (n != _net) {
      _net?.removeListener(_onNet);
      _net = n..addListener(_onNet);
    }
  }

  Net get net => _net ?? _ok;
  MenuState get _state => _dishMenu ? net.menuState(place, _day) : MenuState.ok;

  /// The network moved: a menu that was not showing is now, and arrives; anything else just redraws.
  void _onNet() {
    if (!mounted) return;
    if (_seenKey == '$place|$_day' && _seen != MenuState.ok && _state == MenuState.ok) {
      _arrive.value = 0;
      final a = reducedMotion(context) ? M2Motion.rmFade : M2Motion.settle;
      _arrive.duration = a.duration;
      _arrive.animateTo(1, curve: a.curve);
    }
    setState(() {});
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
      y += switch (it.kind) { ItemKind.head => M2Size.stationRow, ItemKind.dish => it.dish!.name.length > 26 ? M2Layout.rowTall : M2Size.row, ItemKind.note => M2Layout.noteRow, _ => M2Layout.noteRow };
    }
    return y;
  }

  /// The landing row: an estimate until it is built, then its exact offset; the viewport lays out again after each answer, so a
  /// pushed hall is at its dish in the frame it is first drawn.
  double? _landing(double max, double pixels) {
    final here = _here;
    if (here == null) return null;
    final dot = here.indexOf('.'), si = int.parse(here.substring(0, dot)), key = here.substring(dot + 1);
    final y = _topOf(_keys.row(si, key));
    if (y != null) return y - _pin - M2Space.part;
    final i = _items.indexWhere((x) => x.id == here);
    final guess = _estimate(i < 0 ? 0 : i) - _pin - M2Space.part;
    return guess > pixels + 1 ? guess : pixels + widget.height * 0.6; // not built where it should be: keep walking toward it
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
    final store = StoreScope.read(context), a = _actions;
    return Stack(children: [
      Positioned(
        left: 0, right: 0, top: _hh + _th + _sw + lo - _sc.offset,
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = fi; i < _items.length && i < fi + M2Layout.ghostRows; i++)
            buildItem(context, _items[i], fx: fx, store: store, place: place, day: _day, meal: _meal, reveal: _reveal, hereKey: null, keys: null, actions: a),
        ]),
      ),
    ]);
  }

  /// M2 `syncFront`: the plate bar's front plate follows the meal and place the menu shows.
  void _syncFront() {
    final store = StoreScope.read(context), m = plateMeal(fx, place, _meal, DateTime.parse(fx.clock));
    final i = store.plates.plates.indexWhere((pl) => pl.meal == m && (plateHalls(pl) ?? [place]).contains(place));
    if (i >= 0 && i != store.plates.front) store.setFront(i);
  }

  // ---- meal tabs: shared axis
  void _switchMeal(String meal) {
    final ms = mealsOf(fx, _iso, place), from = ms.indexOf(_meal), to = ms.indexOf(meal);
    if (to < 0 || to == from || (_pagerKey.currentState?.running ?? false)) return;
    if (_sc.hasClients && _sc.offset > _r) _sc.jumpTo(_r);
    Haptics.selection();
    final ghost = _captureGhost();
    if (ghost != null) _pagerKey.currentState?.run((to - from).sign, ghost);
    setState(() => _meal = meal);
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
      setState(() {
        _day = i;
        _dayN.value = i;
        _meal = defaultMeal(fx, dayIsos(fx)[i], place, _meal);
        _reveal = false;
        _here = null;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        if (_sc.hasClients) _sc.jumpTo(y.clamp(0.0, _sc.position.maxScrollExtent));
        _updateStation();
        if (i == 0) _syncFront();
      });
    }

    if (rm) {
      swap();
      _dayIn = true;
      _dayFade.duration = M2Motion.rmFade.duration;
      await _dayFade.forward(from: 0);
      return;
    }
    _dayIn = false;
    _dayFade.duration = Duration(milliseconds: (f.ms * M2Motion.sharedXAt).round());
    await _dayFade.animateBack(0, curve: M2Motion.fadeThroughOut.curve); // out: linear to nothing
    if (!mounted) return;
    swap();
    _dayIn = true;
    _dayFade.duration = Duration(milliseconds: (f.ms * (1 - M2Motion.sharedXAt)).round());
    await _dayFade.animateTo(1, curve: f.curve);
    _dayIn = false;
  }

  // ---- stations
  void _openStations() {
    if (_stationsSheet != null) {
      _stationsSheet!.close();
      return;
    }
    final menu = fx.days[_iso]?[place]?[_meal];
    if (menu == null || _station.value == null) return;
    Haptics.selection();
    final store = StoreScope.read(context);
    final view = menuView(fx, _iso, place, _meal, store.prefs, _reveal);
    final stations = [for (final s in view.sections) (name: s.name, count: s.dishes.length, si: menu.indexWhere((x) => x.name == s.name))];
    _stationsSheet = ShellScope.of(context).pushSheet((h, done) => StationSheet(
          handle: h, top: ShellScope.of(context).top + M2Layout.sheetTop, title: '${placeName(fx, place)} ${_meal == 'grab' ? "Grab 'N Go" : mealLabel[_meal]!.toLowerCase()}${_day > 0 ? ', ${dayCell(fx, _day)}' : ''}',
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

  // ---- hours and directions
  void _openHours() {
    Haptics.selection();
    ShellScope.of(context).pushSheet((h, done) => HoursSheet(
          handle: h, top: ShellScope.of(context).top + M2Layout.sheetTop, fx: fx, place: place, chosen: _day, onClosed: done, net: net,
          onEvent: (i) => h.away(() => _actions.onEvent(i)),
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

  // ---- rows
  MealActions get _actions {
    final store = StoreScope.read(context), now = DateTime.parse(fx.clock);
    String pm() => plateMeal(fx, place, _meal, now);
    return MealActions(
      onOpen: (d) => ShellScope.of(context).openDish(DishCtx(dish: d, place: place, meal: _meal, day: _day)),
      onAdd: (d) {
        store.add(pm(), d.name, {place: d});
        Haptics.add();
      },
      onInc: (d) {
        final f = findItem(store.plates, pm(), d.key, place);
        if (f != null) {
          store.step(f.plate.id, d.key, 1);
          Haptics.add();
        }
      },
      onDec: (d) {
        final f = findItem(store.plates, pm(), d.key, place);
        if (f != null) {
          store.step(f.plate.id, d.key, -1);
          Haptics.remove();
        }
      },
      onRetry: () {
        Haptics.light();
        net.retry();
      },
      onEvent: (i) => ShellScope.of(context).pushPage((c, pop) => EventPage(top: ShellScope.of(c).top, index: i, onBack: pop)),
      onReveal: (on) {
        Haptics.selection();
        setState(() => _reveal = on);
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final top = widget.top, hh = _hh, th = _th, sw = _sw, h = widget.height;
    final p = widget.progress;
    final menuOpen = _dishMenu;
    final iso = _iso;
    final meals = menuOpen && _state == MenuState.ok ? mealsOf(fx, iso, place) : const <String>[];
    final meal = meals.isNotEmpty && !meals.contains(_meal) ? defaultMeal(fx, iso, place, _meal) : _meal;
    final store = StoreScope.of(context), spacer = hh + th + sw, tail = M2Layout.listFoot + safeBottom(context);
    final st = _state, ok = st == MenuState.ok, key = '$place|$_day';
    if (st == MenuState.loading) WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? net.request(key) : null);
    _seenKey = key;
    _seen = st;
    _items = menuOpen ? mealItems(fx, store.prefs, place, _day, meal, _reveal, state: st) : _cafe ? cafeItems(fx, place) : const [];
    final wrap = widget.dragWrap ?? (Widget c) => c;
    final status = fx.hours[place]!;
    return ColoredBox(
      color: M2Color.chalk,
      child: Stack(children: [
        // the list: the header's room above it, then the day's meal
        Positioned.fill(
          child: AnimatedBuilder(
            animation: Listenable.merge([p, _dayFade, _arrive]),
            builder: (_, c) {
              final o = incomingOpacity(p.value) * _dayFade.value * _arrive.value;
              final scale = _dayIn && !reducedMotion(context) ? M2Motion.fadeThroughScale + (1 - M2Motion.fadeThroughScale) * _dayFade.value : 1.0;
              return Opacity(
                key: const ValueKey('fade-list'),
                opacity: o.clamp(0.0, 1.0),
                child: Transform.scale(scale: scale, alignment: Alignment(0, (_pin + (h - _pin) / 2) / h * 2 - 1), child: c),
              );
            },
            child: SharedAxisLayer(
              key: _pagerKey,
              child: CustomScrollView(
                controller: _sc, physics: const ClampingScrollPhysics(),
                slivers: [
                  SliverToBoxAdapter(child: wrap(SizedBox(height: spacer))),
                  if (_items.isNotEmpty)
                    MealSliver(
                      sliverKey: _listKey, fx: fx, items: _items, place: place, day: _day, meal: meal, reveal: _reveal, hereKey: _here, keys: _keys, actions: _actions, dragWrap: widget.dragWrap,
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
                _headerWidget(status.general != null),
                if (th > 0)
                  Positioned(
                    left: 0, right: 0, top: hh, height: th,
                    child: MealTabs(
                      key: ValueKey('tabs-$place'), meals: meals, selected: meal, fade: _FadeProduct(p, _dayFade, _arrive), onTap: _switchMeal,
                    ),
                  ),
                if (sw > 0)
                  Positioned(
                    left: 0, right: 0, top: hh + th, height: sw,
                    child: ValueListenableBuilder<int?>(
                      valueListenable: _station,
                      builder: (_, _, _) => StationRow(
                        fade: _FadeProduct(p, _dayFade, _arrive), name: ok ? _stationName(meal) : '', dayLabel: dayCell(fx, _day), open: _stationsSheet != null,
                        topRule: th > 0, onStations: _openStations, onDay: _openHours,
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
      ]),
    );
  }

  /// The header is one widget instance, replaced only when the band's copy goes: a day change builds none of it.
  Widget _headerWidget(bool hasHours) {
    if (_header == null || _headerOpen != widget.bandOpen) {
      _headerOpen = widget.bandOpen;
      _header = HallHeader(
        fx: fx, place: place, top: widget.top, day: _dayN, net: net, progress: widget.progress, scroll: _scrollY, dayFade: _dayFade, band: widget.band, bandOpen: widget.bandOpen,
        onStatus: hasHours ? _openHours : null,
      );
    }
    return _header!;
  }

  String _stationName(String meal) {
    final menu = fx.days[_iso]?[place]?[meal];
    final si = _station.value;
    return menu == null || si == null || si >= menu.length ? '' : menu[si].name;
  }
}

/// Two animations multiplied: the container's incoming fade and the day change's fade.
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
