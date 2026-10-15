import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../motion/fade_through.dart';
import '../motion/routes.dart';
import '../screens/hall/hall_route.dart';
import '../screens/halls/hall_page.dart';
import '../screens/halls/halls_screen.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';
import '../screens/plate/calorie_toss.dart';
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

class _Flight {
  _Flight(this.from, this.text);
  final Offset from;
  final String text;
}

class ShellState extends State<Shell> implements ShellApi {
  final _tab = ValueNotifier<int>(0);
  final _tabBar = GlobalKey();
  final _flights = <_Flight>[];
  final navigator = GlobalKey<NavigatorState>();
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
  void openSearch({required String meal}) => _select(1);

  @override
  void toss({required Offset from, required String text}) {
    if (mounted) setState(() => _flights.add(_Flight(from, text)));
  }

  /// The You tab's slot in the tab bar (a third of it, at the right), in global coordinates.
  Offset get _you {
    final box = _tabBar.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.attached) return Offset.zero;
    final r = box.localToGlobal(Offset.zero) & box.size;
    return Offset(r.left + r.width * 5 / 6, r.top + r.height / 2);
  }

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
            const ColoredBox(color: M2Color.chalk, child: SizedBox.expand()),
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
            builder: (_, i, _) => M2TabBar(key: _tabBar, selected: i, onSelect: _select, disabled: const {}, bottomInset: safeBottom(context)),
          ),
          ]),
          for (final s in _sheets) Positioned.fill(key: ObjectKey(s), child: s.build(s.handle, () => _remove(s))),
          for (final f in _flights)
            Positioned.fill(key: ObjectKey(f), child: CalorieToss(from: f.from, to: _you, text: f.text, onDone: () => mounted ? setState(() => _flights.remove(f)) : null)),
        ])),
      ),
    );
  }
}
