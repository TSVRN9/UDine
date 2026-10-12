import 'package:flutter/widgets.dart';
import '../logic/fixture.dart';
import '../logic/menu_view.dart';
import '../logic/plate.dart';
import '../motion/container_math.dart';
import '../motion/container_transform.dart';
import '../shell_api.dart';
import '../state/store.dart';
import '../theme/tokens.dart';
import '../ui/landing_scroll.dart';
import '../ui/sheet.dart';
import '../ui/ui.dart';
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
  bool _dayIn = false, _daySwap = false;
  // the container's open draws the first screenful of the list and the rest once it is open, so building 70 rows is never in the 500 ms
  late bool _full = widget.land != null || widget.progress.value >= 1;
  late final _dayN = ValueNotifier<int>(widget.land?.day ?? widget.day);
  Widget? _header;
  bool? _headerOpen;
  final _keys = ListKeys();
  final _contentKey = GlobalKey();
  final _pagerKey = GlobalKey<SharedAxisState>();
  final _station = ValueNotifier<int?>(null);
  int _dir = 1;
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
    if (!_full) widget.progress.addStatusListener(_openStatus);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _updateStation();
      if (_day == 0) _syncFront();
    });
  }

  void _openStatus(AnimationStatus s) {
    if (s == AnimationStatus.completed && !_full) {
      widget.progress.removeStatusListener(_openStatus);
      setState(() => _full = true);
    }
  }

  @override
  void dispose() {
    widget.progress.removeStatusListener(_openStatus);
    _sc.removeListener(_onScroll);
    _sc.dispose();
    _scrollY.dispose();
    _dayFade.dispose();
    _dayN.dispose();
    _station.dispose();
    super.dispose();
  }

  // ---- scroll
  void _onScroll() {
    if (!_sc.hasClients) return;
    final d = _sc.offset.clamp(0.0, _r);
    if (d != _scrollY.value) _scrollY.value = d;
    _updateStation();
  }

  RenderBox? _contentBox() => _contentKey.currentContext?.findRenderObject() as RenderBox?;
  double? _offsetOf(GlobalKey k) {
    final box = k.currentContext?.findRenderObject() as RenderBox?, content = _contentBox();
    if (box == null || content == null || !box.attached || !box.hasSize) return null;
    return box.getTransformTo(content).getTranslation().y;
  }

  double? _landing(double max) {
    final here = _here;
    if (here == null) return null;
    final dot = here.indexOf('.'), y = _offsetOf(_keys.row(int.parse(here.substring(0, dot)), here.substring(dot + 1)));
    return y == null ? null : (y - _pin - M2Space.part).clamp(0, max);
  }

  /// M2 `curStation`: the last station whose head has reached the line under the pinned rows.
  void _updateStation() {
    final stations = _keys.stations.keys.toList()..sort();
    if (stations.isEmpty || !_sc.hasClients) {
      if (_station.value != null && stations.isEmpty) _station.value = null;
      return;
    }
    final y = _sc.offset + _pin + 2;
    int? cur;
    for (final si in stations) {
      final top = _offsetOf(_keys.stations[si]!);
      if (top != null && top <= y) cur = si;
    }
    cur ??= stations.first;
    if (cur != _station.value) _station.value = cur;
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
    setState(() {
      _dir = (to - from).sign;
      _meal = meal;
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
      setState(() {
        _daySwap = true;
        _day = i;
        _dayN.value = i;
        _meal = defaultMeal(fx, dayIsos(fx)[i], place, _meal);
        _reveal = false;
        _here = null;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _daySwap = false;
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
    final y = _offsetOf(_keys.station(si));
    if (y == null || !_sc.hasClients) return;
    Haptics.selection();
    final to = (y - _pin).clamp(0.0, _sc.position.maxScrollExtent);
    final a = resolveAnim(context, M2Motion.scroll);
    if (reducedMotion(context)) {
      _sc.jumpTo(to);
    } else {
      _sc.animateTo(to, duration: a.duration, curve: a.curve);
    }
  }

  // ---- hours and directions
  void _openHours() {
    Haptics.selection();
    ShellScope.of(context).pushSheet((h, done) => HoursSheet(
          handle: h, top: ShellScope.of(context).top + M2Layout.sheetTop, fx: fx, place: place, chosen: _day, onClosed: done,
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
    final meals = menuOpen ? mealsOf(fx, iso, place) : const <String>[];
    final meal = meals.isNotEmpty && !meals.contains(_meal) ? defaultMeal(fx, iso, place, _meal) : _meal;
    final list = menuOpen
        ? MealList(fx: fx, place: place, day: _day, meal: meal, reveal: _reveal, hereKey: _here, actions: _actions, limit: _full ? null : M2Layout.firstScreen)
        : const SizedBox.shrink();
    final listArea = ConstrainedBox(
      constraints: BoxConstraints(minHeight: h),
      child: ColoredBox(color: M2Color.chalk, child: ListKeysScope(keys: _keys, child: SharedAxis(key: _pagerKey, id: meal, dir: _dir, still: _daySwap, copyOf: (c) => ListKeysScope(keys: null, child: c), child: list))),
    );
    final padB = SizedBox(height: M2Layout.listPadBottom2 + MediaQuery.paddingOf(context).bottom);
    final status = fx.hours[place]!;
    return ColoredBox(
      color: M2Color.chalk,
      child: Stack(children: [
        // the list: the header's room above it, then the day's meal
        Positioned.fill(
          child: AnimatedBuilder(
            animation: Listenable.merge([p, _dayFade]),
            builder: (_, c) {
              final o = incomingOpacity(p.value) * _dayFade.value;
              final scale = _dayIn && !reducedMotion(context) ? M2Motion.fadeThroughScale + (1 - M2Motion.fadeThroughScale) * _dayFade.value : 1.0;
              return Opacity(
                opacity: o.clamp(0.0, 1.0),
                child: Transform.scale(scale: scale, alignment: Alignment(0, (_pin + (h - _pin) / 2) / h * 2 - 1), child: c),
              );
            },
            child: SingleChildScrollView(
              controller: _sc, physics: const ClampingScrollPhysics(),
              child: (widget.dragWrap ?? (c) => c)(Column(key: _contentKey, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                SizedBox(height: hh + th + sw),
                listArea,
                padB,
              ])),
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
                      key: ValueKey('tabs-$place'), meals: meals, selected: meal, fade: _FadeProduct(p, _dayFade), onTap: _switchMeal,
                    ),
                  ),
                if (sw > 0)
                  Positioned(
                    left: 0, right: 0, top: hh + th, height: sw,
                    child: ValueListenableBuilder<int?>(
                      valueListenable: _station,
                      builder: (_, _, _) => StationRow(
                        fade: _FadeProduct(p, _dayFade), name: _stationName(meal), dayLabel: dayCell(fx, _day), open: _stationsSheet != null,
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
        fx: fx, place: place, top: widget.top, day: _dayN, progress: widget.progress, scroll: _scrollY, dayFade: _dayFade, band: widget.band, bandOpen: widget.bandOpen,
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
  _FadeProduct(this.p, this.day);
  final Animation<double> p, day;
  @override
  double get value => (incomingOpacity(p.value) * day.value).clamp(0.0, 1.0);
  @override
  AnimationStatus get status => AnimationStatus.forward;
  @override
  void didRegisterListener() {
    p.addListener(notifyListeners);
    day.addListener(notifyListeners);
  }

  @override
  void didUnregisterListener() {
    p.removeListener(notifyListeners);
    day.removeListener(notifyListeners);
  }
}
