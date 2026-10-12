import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'logic/fixture.dart';
import 'motion/push.dart';
import 'screens/dish_sheet.dart';
import 'screens/hall_menu.dart';
import 'screens/halls.dart';
import 'screens/plate_sheet.dart';
import 'screens/you.dart';
import 'shell_api.dart';
import 'state/store.dart';
import 'theme/tokens.dart';
import 'ui/sheet.dart';
import 'ui/ui.dart';

class _Sheet {
  final SheetHandle handle = SheetHandle();
  final Widget Function(SheetHandle, VoidCallback) build;
  _Sheet(this.build);
}

/// The app around the screens (M2 `#frame`): the tabs (Halls, You; Search is inert) fading through, a page pushed over them, the plate
/// bar and sheet above them, the tab bar under them, and sheets over everything. Android back closes the topmost layer.
class Shell extends StatefulWidget {
  final Fixture fx;
  final List<String> pins;
  final Store store;
  const Shell({super.key, required this.fx, required this.pins, required this.store});
  @override
  State<Shell> createState() => ShellState();
}

class ShellState extends State<Shell> with TickerProviderStateMixin implements ShellApi {
  int _tab = 0;
  final _halls = GlobalKey<HallsTabState>(), _plate = GlobalKey<PlateLayerState>();
  late final PushController _push = PushController(vsync: this);
  final _sheets = <_Sheet>[];
  double _top = 24;

  @override
  double get top => _top;

  /// The push's controller, for tests.
  PushController get push => _push;

  @override
  void dispose() {
    _push.dispose();
    super.dispose();
  }

  @override
  SheetHandle pushSheet(Widget Function(SheetHandle handle, VoidCallback done) build) {
    final s = _Sheet(build);
    setState(() => _sheets.add(s));
    return s.handle;
  }

  void _remove(_Sheet s) {
    if (mounted) setState(() => _sheets.remove(s));
  }

  @override
  void openDish(DishCtx ctx) => pushSheet((h, done) => DishSheet(handle: h, ctx: ctx, top: _top + M2Layout.sheetTop, onClosed: done));

  @override
  void pushHall(HallTarget t) => _push.push((ctx, pop) => LayoutBuilder(builder: (_, c) => HallMenu(fx: widget.fx, place: t.place, top: _top, height: c.maxHeight, land: t, onBack: pop)));

  @override
  void pushPage(Widget Function(BuildContext context, VoidCallback pop) build) => _push.push(build);

  // hardware back: the topmost layer first
  void _back() {
    if (_sheets.isNotEmpty) {
      _sheets.last.handle.close();
    } else if (_push.open) {
      _push.pop();
    } else if (_plate.currentState?.expanded ?? false) {
      _plate.currentState!.collapse();
    } else if (!(_halls.currentState?.closeHall() ?? false)) {
      SystemNavigator.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final pad = MediaQuery.paddingOf(context);
    _top = pad.top < M2Layout.safeTopMin ? M2Layout.safeTopMin : pad.top; // --st: max(24px, env(safe-area-inset-top))
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) => didPop ? null : _back(),
      child: ColoredBox(
        color: M2Color.chalk,
        child: ShellScope(
          api: this,
          child: Stack(children: [
            Column(children: [
              Expanded(
                child: Stack(children: [
                  Positioned.fill(
                    child: PushHost(
                      controller: _push,
                      child: FadeThroughTabs(index: _tab == 2 ? 1 : 0, children: [HallsTab(key: _halls, fx: widget.fx, pins: widget.pins, top: _top), YouScreen(top: _top)]),
                    ),
                  ),
                  Positioned.fill(child: PlateLayer(key: _plate, top: _top + M2Layout.sheetTop)),
                ]),
              ),
              M2TabBar(selected: _tab, onSelect: (i) { Haptics.selection(); setState(() => _tab = i); _push.pop(); }, bottomInset: pad.bottom),
            ]),
            for (final s in _sheets) Positioned.fill(key: ObjectKey(s), child: s.build(s.handle, () => _remove(s))),
          ]),
        ),
      ),
    );
  }
}
