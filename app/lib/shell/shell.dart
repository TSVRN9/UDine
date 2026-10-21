import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../alerts/alerts.dart' show alertTaps, takeHeldTap;
import '../core/m2/history.dart' show cafeIdsOf;
import '../core/store/log_book.dart';
import '../data/repository.dart' show DataState, HoursData, Loaded, LoadedOffline;
import '../motion/fade_through.dart';
import 'app_scope.dart';
import '../motion/routes.dart';
import '../motion/track_lift.dart';
import '../screens/hall/hall_route.dart';
import '../screens/halls/hall_page.dart';
import '../screens/dish/food_sheet.dart';
import '../screens/plate/custom_food.dart';
import '../screens/halls/halls_screen.dart';
import '../screens/you/day_page.dart';
import '../screens/you/settings_pages.dart';
import '../screens/you/you_screen.dart';
import '../screens/search/events.dart';
import '../screens/search/search_screen.dart';
import '../core/m2/search.dart' show Lens;
import '../theme/tokens.dart';
import '../ui/ui.dart';
import 'shell_scope.dart';

/// The app around the screens (M2 `#frame`): the tabs fading through, a stack of pages over them (a card from a band, a push from
/// a row, to any depth), the plate bar's slot above the tab bar, and the tab bar under it all. The tab bar and the plate bar never
/// move with a page. Android back closes the top page first. Search and You are empty until their briefs.
class Shell extends StatefulWidget {
  const Shell({super.key, this.plateBar, this.initialRoute = '/'});

  /// `/hall/<slug>?meal=&day=` opens that hall's menu over Halls at launch (a screenshot route); anything else opens Halls.
  final String initialRoute;

  /// The plate bar (`flutter-port-dish-and-plate`): drawn above the tab bar on every tab, over the stack.
  final Widget? plateBar;
  @override
  State<Shell> createState() => ShellState();
}

class _Sheet {
  _Sheet(this.build, {this.onboarding = false});
  final bool onboarding;
  final SheetHandle handle = SheetHandle();
  final Widget Function(SheetHandle, VoidCallback) build;
}

class ShellState extends State<Shell> with WidgetsBindingObserver, SingleTickerProviderStateMixin implements ShellApi {
  late final _tab = ValueNotifier<int>(searchLaunch(widget.initialRoute) != null ? 1 : Uri.parse(widget.initialRoute).path.startsWith('/you') ? 2 : 0);
  SheetHandle? Function()? _plateBack;
  final navigator = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _lift = context.getInheritedWidgetOfExactType<AppScope>()?.prefs.lift?..attach(this);
    _tab.addListener(_tabChanged);
    // `/custom?name=&meal=` (a screenshot route): the custom food form over Halls; `cal`, `p`, `c` and `f` fill the macros
    final u = Uri.parse(widget.initialRoute), q = u.queryParameters;
    // `/food?name=Chobani[&edit=1]` (a screenshot route): that saved food's sheet over Halls, in Edit with `edit=1`
    if (u.path == '/food') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final scope = AppScope.of(context), f = scope.foods?.foods.where((x) => x.name == q['name']).firstOrNull;
        if (f != null) openFoodSheet(navigator.currentContext!, food: f, meal: 'lunch', startEdit: q['edit'] == '1');
      });
    }
    // A tap on a favourite-alert notification: Halls home. One launched by it was held until now.
    _taps = alertTaps.stream.listen(_landAlert);
    if (takeHeldTap() case final route?) WidgetsBinding.instance.addPostFrameCallback((_) => _landAlert(route));
    if (u.path == '/custom') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) openCustomFood(navigator.currentContext!, name: q['name'] ?? '', meal: q['meal'] ?? 'lunch', cal: q['cal'] ?? '', p: q['p'] ?? '', c: q['c'] ?? '', f: q['f'] ?? '');
      });
    }
  }
  StreamSubscription<String>? _taps;
  TrackLift? _lift;

  /// A notification tap lands on Halls home, with nothing pushed: favourites show there themselves. Every sheet closes the normal way, except
  /// first run: onboarding the user has not finished stays over Halls, and dismissing it is theirs to do.
  void _landAlert(String _) {
    if (!mounted) return;
    for (final s in [..._sheets]) {
      if (!s.onboarding) s.handle.close();
    }
    _plateBack?.call()?.close();
    navigator.currentState?.popUntil((r) => r.isFirst);
    _tab.value = 0;
  }

  final _sheets = <_Sheet>[];

  @override
  SheetHandle pushSheet(Widget Function(SheetHandle handle, VoidCallback done) build, {bool onboarding = false}) {
    final s = _Sheet(build, onboarding: onboarding);
    setState(() => _sheets.add(s));
    return s.handle;
  }

  @override
  void openPlace(String place, {required String meal, required int day, required String dish}) =>
      Nav.push<void>(navigator.currentContext!, (_) => HallMenuPage(place: place, top: safeTop(context), day: day, meal: meal, landOn: dish));

  @override
  void handleBack(SheetHandle? Function()? openSheet) => _plateBack = openSheet;

  @override
  void openSearch({required String meal}) => _select(1);

  void _remove(_Sheet s) {
    if (mounted) setState(() => _sheets.remove(s));
  }

  StreamSubscription<DataState<HoursData>>? _hours;
  LogBook? _book;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_book == null && AppScope.of(context).log != null) {
      _book = AppScope.of(context).log!..addListener(_wantCafeIds);
      _wantCafeIds();
    }
  }

  /// The café ids the saved hours carry name a café's past meals (You). Asked for only once the log holds one, so a log of halls costs
  /// nothing; a failure or no hours leaves the meal as "Lunch".
  void _wantCafeIds() {
    final book = _book!, scope = AppScope.of(context);
    if (_hours != null || !book.meals.any((m) => m.needsCafeIds)) return;
    _hours = scope.repo.hours(scope.repo.today).listen((s) {
      if (s is Loaded<HoursData>) {
        book.cafeIds = cafeIdsOf(s.value.feed);
      } else if (s is LoadedOffline<HoursData>) {
        book.cafeIds = cafeIdsOf(s.value.feed);
      }
    }, onError: (Object _) {});
  }

  /// Health Connect is asked again when the app comes back (a permission is granted or revoked in system settings) and when You is shown;
  /// Notify me's permission is read again on coming back too, as it may have been revoked in system settings.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    AppScope.of(context).health?.refresh();
    AppScope.of(context).alerts.refresh();
  }

  void _tabChanged() {
    if (_tab.value == 2) AppScope.of(context).health?.refresh();
  }

  @override
  void dispose() {
    _tab.removeListener(_tabChanged);
    WidgetsBinding.instance.removeObserver(this);
    _taps?.cancel();
    _hours?.cancel();
    _book?.removeListener(_wantCafeIds);
    _lift?.detach();
    _tab.dispose();
    super.dispose();
  }

  Route<void> _tabs(RouteSettings s, double top) => BaseRoute<void>(
        settings: s,
        builder: (_) => ValueListenableBuilder<int>(
          valueListenable: _tab,
          builder: (_, i, _) => FadeThroughTabs(index: i, pinned: [0, top + M2Layout.searchHeadTop + M2Layout.fieldH + M2Layout.searchHeadBottom, 0], children: [
            HallsScreen(top: top),
            SearchScreen(top: top, tab: _tab, query: searchLaunch(widget.initialRoute)?.$1 ?? '', lenses: searchLaunch(widget.initialRoute)?.$2 ?? const {}, idle: EventsIdle(top: top)),
            YouScreen(top: top),
          ]),
        ),
      );

  /// `/you/day/2026-10-07`, `/you/diet`, `/you/rank`, `/you/export`, `/you/favs` and `/you/foods` open that page over You at launch (screenshot routes).
  Route<void>? _youLaunch(String route, double top) {
    final s = Uri.parse(route).pathSegments;
    if (s.isEmpty || s[0] != 'you') return null;
    final page = switch (s) { [_, 'day', final d] => DayPage(top: top, day: d), [_, 'diet'] => DietPage(top: top), [_, 'rank'] => RankPage(top: top), [_, 'export'] => ExportPage(top: top), [_, 'favs'] => FavoritesPage(top: top), [_, 'foods'] => FoodsPage(top: top), _ => null };
    return page == null ? null : BaseRoute<void>(settings: RouteSettings(name: route), builder: (_) => page);
  }


  void _select(int i) {
    Haptics.selection();
    if (i == 2) AppScope.of(context).alerts.refresh();
    navigator.currentState?.popUntil((r) => r.isFirst);
    _tab.value = i;
  }

  /// The sheet back closes first: the last one pushed, else the plate while it is up.
  /// A sheet already on its way out (its spring runs for a while before it leaves `_sheets`) is passed over: a second back goes to what is under it.
  SheetHandle? _backSheet() => [..._sheets.reversed.map((s) => s.handle), ?_plateBack?.call()].where((h) => !h.closing).firstOrNull;

  /// The page back pops, when there is one over the tab that moves.
  StackRoute<dynamic>? _backPage() {
    final n = navigator.currentState;
    if (n == null || !n.canPop()) return null;
    Route<dynamic>? top;
    n.popUntil((r) {
      top = r; // (only reads the top: the first route asked says stop)
      return true;
    });
    // (a page opened at launch is a BaseRoute: it never moves, so Android's plain back closes it)
    return top is StackRoute<dynamic> && top is! BaseRoute<dynamic> ? top as StackRoute<dynamic> : null;
  }

  // ---- Android's predictive back: the system gesture drives what `_back` would close, with the frames of its own drag-back ----

  ({void Function(double dist) move, void Function(bool commit) end})? _gesture;
  double _gestureX = 0;

  @override
  bool handleStartBackGesture(PredictiveBackEvent backEvent) {
    final at = backEvent.touchOffset;
    if (at == null) return false; // a back button: `_back`, at once
    final w = MediaQuery.sizeOf(context).width;
    if (_backSheet() case final s?) {
      s.backStart();
      _gesture = (move: s.backMove, end: (c) => s.backEnd(commit: c));
    } else if (_backPage() case final r?) {
      r.backStart();
      _gesture = (move: (d) => r.backMove(d, w), end: (c) => r.backEnd(commit: c));
    } else {
      return false; // nothing to close: Android's own back (`_back` leaves the app)
    }
    _gestureX = at.dx;
    return true;
  }

  // Android sends the touch in physical px.
  @override
  void handleUpdateBackGestureProgress(PredictiveBackEvent backEvent) {
    final at = backEvent.touchOffset;
    if (at != null) _gesture?.move((at.dx - _gestureX).abs() / View.of(context).devicePixelRatio);
  }

  @override
  void handleCommitBackGesture() => _endGesture(true);

  @override
  void handleCancelBackGesture() => _endGesture(false);

  void _endGesture(bool commit) {
    final g = _gesture;
    _gesture = null;
    g?.end(commit);
  }

  void _back() {
    final n = navigator.currentState;
    if (_backSheet() case final s?) {
      s.close();
    } else if (n != null && n.canPop()) {
      n.pop();
    } else {
      SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final top = safeTop(context);
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) => didPop ? null : _back(),
      child: ColoredBox(
        color: M2Color.chalk,
        child: ShellScope(api: this, child: Stack(children: [
          Column(children: [
          Expanded(
            child: Stack(children: [
              Positioned.fill(
                child: Navigator(
                  key: navigator,
                  onGenerateInitialRoutes: (_, name) => [_tabs(const RouteSettings(name: '/'), top), ?hallLaunchRoute(widget.initialRoute, top), ?_youLaunch(widget.initialRoute, top)],
                  onGenerateRoute: (s) => _tabs(s, top),
                ),
              ),
              if (widget.plateBar != null) Positioned.fill(child: widget.plateBar!),
            ]),
          ),
          ValueListenableBuilder<int>(
            valueListenable: _tab,
            builder: (_, i, _) => M2TabBar(selected: i, onSelect: _select, disabled: const {}, bottomInset: safeBottom(context)),
          ),
          ]),
          for (final s in _sheets) Positioned.fill(key: ObjectKey(s), child: s.build(s.handle, () => _remove(s))),
        ])),
      ),
    );
  }
}

/// `/search`, `/search?q=pizza`, `/search?lens=halal,protein`: Search at launch (screenshots, deep links), with its query and lenses; null for any
/// other route.
(String, Set<Lens>)? searchLaunch(String route) {
  final u = Uri.parse(route);
  if (u.path != '/search') return null;
  final names = Lens.values.asNameMap();
  return (u.queryParameters['q'] ?? '', {for (final l in (u.queryParameters['lens'] ?? '').split(',')) ?names[l]});
}
