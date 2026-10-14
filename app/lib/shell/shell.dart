import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../motion/fade_through.dart';
import '../motion/routes.dart';
import '../screens/cafes/cafe_page.dart';
import '../screens/cafes/cafes_page.dart';
import '../screens/halls/halls_screen.dart';
import 'app_scope.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

/// The app around the screens (M2 `#frame`): the tabs fading through, a stack of pages over them (a card from a band, a push from
/// a row, to any depth), the plate bar's slot above the tab bar, and the tab bar under it all. The tab bar and the plate bar never
/// move with a page. Android back closes the top page first. Search and You are empty until their briefs.
class Shell extends StatefulWidget {
  const Shell({super.key, this.plateBar, this.route = '/'});

  /// A screenshot route (`/cafes`, `/cafes?area=3`, `/cafe/c27`) opens that page over Halls on the first frame.
  final String route;

  /// The plate bar (`flutter-port-dish-and-plate`): drawn above the tab bar on every tab, over the stack.
  final Widget? plateBar;
  @override
  State<Shell> createState() => ShellState();
}

class ShellState extends State<Shell> {
  final _tab = ValueNotifier<int>(0);
  final navigator = GlobalKey<NavigatorState>();

  @override
  void initState() {
    super.initState();
    final u = Uri.parse(widget.route), seg = u.pathSegments;
    if (seg.isEmpty || (seg.first != 'cafes' && seg.first != 'cafe')) return;
    WidgetBuilder? page;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final ctx = navigator.currentContext!, t = safeTop(context);
      if (seg.first == 'cafes') {
        AppScope.of(ctx).prefs.lastHall = 'W'; // M2's own `?state=cafes` opens with Worcester the last hall
        page = (_) => CafesPage(top: t, area: int.tryParse(u.queryParameters['area'] ?? ''));
      } else if (seg.length > 1) {
        page = (_) => CafePage(cafeKey: seg[1].startsWith('c') ? seg[1] : 'c${seg[1]}', top: t);
      }
      if (page != null) Nav.push<void>(ctx, page!);
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  void _select(int i) {
    Haptics.selection();
    navigator.currentState?.popUntil((r) => r.isFirst);
    _tab.value = i;
  }

  void _back() {
    final n = navigator.currentState;
    if (n != null && n.canPop()) {
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
        child: Column(children: [
          Expanded(
            child: Stack(children: [
              Positioned.fill(
                child: Navigator(
                  key: navigator,
                  onGenerateRoute: (s) => BaseRoute<void>(
                    settings: s,
                    builder: (_) => ValueListenableBuilder<int>(
                      valueListenable: _tab,
                      builder: (_, i, _) => FadeThroughTabs(index: i, children: [
                        HallsScreen(top: top),
                        const ColoredBox(color: M2Color.chalk, child: SizedBox.expand()),
                        const ColoredBox(color: M2Color.chalk, child: SizedBox.expand()),
                      ]),
                    ),
                  ),
                ),
              ),
              if (widget.plateBar != null) Positioned(left: 0, right: 0, bottom: 0, child: widget.plateBar!),
            ]),
          ),
          ValueListenableBuilder<int>(
            valueListenable: _tab,
            builder: (_, i, _) => M2TabBar(selected: i, onSelect: _select, disabled: const {}, bottomInset: safeBottom(context)),
          ),
        ]),
      ),
    );
  }
}
