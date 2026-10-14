import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../motion/fade_through.dart';
import '../motion/routes.dart';
import '../screens/halls/halls_screen.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

/// The app around the screens (M2 `#frame`): the tabs fading through, a stack of pages over them (a card from a band, a push from
/// a row, to any depth), the plate bar's slot above the tab bar, and the tab bar under it all. The tab bar and the plate bar never
/// move with a page. Android back closes the top page first. Search and You are empty until their briefs.
class Shell extends StatefulWidget {
  const Shell({super.key, this.plateBar});

  /// The plate bar (`flutter-port-dish-and-plate`): drawn above the tab bar on every tab, over the stack.
  final Widget? plateBar;
  @override
  State<Shell> createState() => ShellState();
}

class ShellState extends State<Shell> {
  final _tab = ValueNotifier<int>(0);
  final navigator = GlobalKey<NavigatorState>();

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
