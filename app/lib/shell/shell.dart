import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../motion/fade_through.dart';
import '../motion/routes.dart';
import '../screens/hall/hall_route.dart';
import '../screens/halls/hall_page.dart';
import '../screens/plate/custom_food.dart';
import '../screens/halls/halls_screen.dart';
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
  _Sheet(this.build);
  final SheetHandle handle = SheetHandle();
  final Widget Function(SheetHandle, VoidCallback) build;
}

class ShellState extends State<Shell> implements ShellApi {
  late final _tab = ValueNotifier<int>(searchLaunch(widget.initialRoute) == null ? 0 : 1);
  bool Function()? _plateBack;
  final navigator = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    // `/custom?name=&meal=` (a screenshot route): the custom food form over Halls; `cal`, `p`, `c` and `f` fill the macros
    final u = Uri.parse(widget.initialRoute), q = u.queryParameters;
    if (u.path == '/custom') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) openCustomFood(navigator.currentContext!, name: q['name'] ?? '', meal: q['meal'] ?? 'lunch', cal: q['cal'] ?? '', p: q['p'] ?? '', c: q['c'] ?? '', f: q['f'] ?? '');
      });
    }
  }
  final _sheets = <_Sheet>[];

  @override
  SheetHandle pushSheet(Widget Function(SheetHandle handle, VoidCallback done) build) {
    final s = _Sheet(build);
    setState(() => _sheets.add(s));
    return s.handle;
  }

  @override
  void openPlace(String place, {required String meal, required int day, required String dish}) =>
      Nav.push<void>(navigator.currentContext!, (_) => HallMenuPage(place: place, top: safeTop(context), day: day, meal: meal, landOn: dish));

  @override
  void handleBack(bool Function()? handler) => _plateBack = handler;

  @override
  void openSearch({required String meal}) => _select(1);

  void _remove(_Sheet s) {
    if (mounted) setState(() => _sheets.remove(s));
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  Route<void> _tabs(RouteSettings s, double top) => BaseRoute<void>(
        settings: s,
        builder: (_) => ValueListenableBuilder<int>(
          valueListenable: _tab,
          builder: (_, i, _) => FadeThroughTabs(index: i, children: [
            HallsScreen(top: top),
            SearchScreen(top: top, tab: _tab, query: searchLaunch(widget.initialRoute)?.$1 ?? '', lenses: searchLaunch(widget.initialRoute)?.$2 ?? const {}, idle: EventsIdle(top: top)),
            const ColoredBox(color: M2Color.chalk, child: SizedBox.expand()),
          ]),
        ),
      );

  void _select(int i) {
    Haptics.selection();
    navigator.currentState?.popUntil((r) => r.isFirst);
    _tab.value = i;
  }

  void _back() {
    final n = navigator.currentState;
    if (_sheets.isNotEmpty) {
      _sheets.last.handle.close();
    } else if (_plateBack?.call() ?? false) {
      return;
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
                  onGenerateInitialRoutes: (_, name) => [_tabs(const RouteSettings(name: '/'), top), ?hallLaunchRoute(widget.initialRoute, top)],
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
