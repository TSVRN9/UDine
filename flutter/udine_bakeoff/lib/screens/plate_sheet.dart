import 'dart:async';
import 'package:flutter/widgets.dart';
import '../logic/dish_sheet.dart';
import '../logic/fixture.dart';
import '../logic/plate.dart';
import '../shell_api.dart';
import '../state/store.dart';
import '../theme/tokens.dart';
import '../ui/sheet.dart';
import '../ui/ui.dart';
import 'plate_bar.dart';

/// The plate bar and the plate sheet, one thing (M2 `#bar` and `#psheet`): the bar is the sheet's handle and its top edge, sitting just
/// above the tab bar; drag it up and it grows into the sheet (detents bar, mid and top), tap it for mid, swipe it sideways to change
/// plate. The bar rises from behind the tab bar on the first add on `cont`. Log turns the bar into a receipt with Undo that crossfades
/// in place for five seconds. The layer fills the frame above the tab bar.
class PlateLayer extends StatefulWidget {
  final double top;
  const PlateLayer({super.key, required this.top});
  @override
  State<PlateLayer> createState() => PlateLayerState();
}

class PlateLayerState extends State<PlateLayer> with TickerProviderStateMixin {
  final handle = SheetHandle();
  final _size = ValueNotifier<double>(0);
  late final AnimationController _rise = AnimationController(vsync: this);
  late final AnimationController _swipe = AnimationController(vsync: this, value: 1);
  Store? _store;
  bool _choose = false, _wasVisible = false;
  Timer? _timer;
  double _dx = 0, _slideDir = 1;
  final _body = ValueNotifier<int>(0);

  bool _visible(Store s) => s.plates.plates.isNotEmpty || s.last != null;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final s = StoreScope.of(context);
    if (_store != s) {
      _store?.removeListener(_changed);
      _store = s..addListener(_changed);
      _wasVisible = _visible(s);
      _rise.value = _wasVisible ? 1 : 0;
    }
  }

  void _changed() {
    final s = _store!, vis = _visible(s);
    if (vis != _wasVisible) {
      _wasVisible = vis;
      final a = resolveAnim(context, M2Motion.cont);
      _rise.duration = a.duration;
      vis ? _rise.forward() : _rise.reverse();
    }
    _timer?.cancel();
    if (s.last != null) {
      _timer = Timer(const Duration(milliseconds: M2Motion.receiptD), () => s.dropReceipt());
    }
    if (s.plates.plates.length < 2 || s.plates.plates.isEmpty) _choose = false;
    if (s.plates.plates.isEmpty && handle.attached) handle.to(M2Layout.barMin);
  }

  @override
  void dispose() {
    _store?.removeListener(_changed);
    _timer?.cancel();
    _rise.dispose();
    _swipe.dispose();
    _size.dispose();
    _body.dispose();
    super.dispose();
  }

  BarMode get _mode => _store!.last != null ? BarMode.logged : _choose ? BarMode.choose : BarMode.plate;

  void _log([String? at]) {
    _store!.logPlate(at);
    _choose = false;
    Haptics.log();
    handle.to(M2Layout.barMin);
  }

  void _onLog() {
    final pl = _store!.plates.plates[_store!.plates.front], hs = plateHalls(pl);
    if (hs != null && hs.length > 1) {
      setState(() => _choose = true);
    } else {
      _log();
    }
  }

  // ---- the bar's gestures: a tap opens to mid, a sideways swipe changes plate
  void _swipeEnd(DragEndDetails e) {
    final s = _store!, n = s.plates.plates.length, vx = e.velocity.pixelsPerSecond.dx / 1000;
    if (n > 1 && (_dx.abs() > M2Motion.plateSwipeCommit || vx.abs() > M2Motion.plateSwipeFlick)) {
      final dir = _dx < 0 ? 1 : -1;
      s.setFront((s.plates.front + dir + n) % n);
      Haptics.selection();
      _slideDir = dir.toDouble();
      _swipe.duration = resolveAnim(context, M2Motion.settle).duration;
      _swipe.forward(from: 0);
    } else {
      _slideDir = 0;
      _swipe.value = 1;
    }
    setState(() => _dx = 0);
  }

  @override
  Widget build(BuildContext context) {
    final s = StoreScope.of(context), fx = s.fx;
    final n = s.plates.plates.length;
    final face = s.plates.plates.isEmpty && s.last == null
        ? const SizedBox(height: M2Layout.barMin)
        : GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              if (_mode == BarMode.plate && s.plates.plates.isNotEmpty) handle.to(_midPx);
            },
            onHorizontalDragUpdate: _mode == BarMode.plate ? (e) => setState(() => _dx += e.delta.dx) : null,
            onHorizontalDragEnd: _mode == BarMode.plate ? _swipeEnd : null,
            child: AnimatedBuilder(
              animation: _swipe,
              builder: (_, child) {
                final a = M2Motion.settle.curve.transform(_swipe.value);
                final shift = _dx != 0 ? (n > 1 ? _dx : _dx * M2Motion.plateSwipeRubber) : _slideDir * M2Motion.plateSwipeShift * (1 - a);
                return Opacity(opacity: _dx != 0 ? 1 : (_slideDir == 0 ? 1 : a), child: Transform.translate(offset: Offset(shift, 0), child: child));
              },
              child: Arrive(
                key: ValueKey(_mode), // the receipt (and Undo's plate) crossfade in where the other was
                child: PlateBarFace(store: s, mode: _mode, onLog: _onLog, onUnchoose: () => setState(() => _choose = false), onUndo: () { s.undo(); Haptics.light(); }, onLogAt: _log),
              ),
            ),
          );
    final bar = ColoredBox(
      color: M2Color.dm,
      child: Stack(children: [face, if (n > 1 && _mode == BarMode.plate) PlateBarDots(n: n, front: s.plates.front)]),
    );
    return AnimatedBuilder(
      animation: _rise,
      builder: (context, _) {
        final v = M2Motion.cont.curve.transform(_rise.value);
        return IgnorePointer(
          ignoring: _rise.value == 0,
          child: Transform.translate(
            offset: Offset(0, (1 - v) * M2Layout.barMin * 1.1),
            child: Stack(children: [
              M2Sheet(
                handle: handle, top: widget.top, min: M2Layout.barMin, startOpen: false, radius: 0, header: bar, color: M2Color.chalk, bottomPad: M2Layout.plateFoot + MediaQuery.paddingOf(context).bottom,
                mid: (m) => _mid = _midOf(m), onSize: (px) => _size.value = px,
                slivers: [
                  SliverToBoxAdapter(
                    child: s.plates.plates.isEmpty
                        ? const SizedBox.shrink()
                        : _Body(key: ValueKey(s.plates.plates[s.plates.front].id), store: s, fx: fx, onDish: _openDish),
                  ),
                ],
              ),
              if (n > 1 && _mode == BarMode.plate)
                ValueListenableBuilder<double>(
                  valueListenable: _size,
                  builder: (_, px, _) => Positioned(left: M2Layout.peekInset, right: M2Layout.peekInset, bottom: px, child: const PlateBarPeek()),
                ),
            ]),
          ),
        );
      },
    );
  }

  /// Whether the sheet is above the bar (hardware back brings it down).
  bool get expanded => handle.px > M2Layout.barMin + 1;
  void collapse() => handle.to(M2Layout.barMin);

  double _mid = M2Layout.barMin;
  double get _midPx => _mid;
  double _midOf(SheetMetrics m) {
    final screen = MediaQuery.sizeOf(context).height;
    return (m.content + M2Layout.treatTop).clamp(M2Layout.barMin, m.height - M2Layout.midFrac * screen);
  }

  void _openDish(Plate pl, PlateItem it) {
    final hs = plateHalls(pl);
    if (it.custom != null) return;
    final place = hs?.first ?? it.refs.keys.first;
    ShellScope.of(context).openDish(DishCtx(dish: it.refs[place] ?? it.refs.values.first, place: place, meal: pl.meal, day: 0, fromPlate: true, refs: it.refs));
  }
}

/// The sheet's body (`#psbody`): tabs when there are several plates, the plate's rows with their steppers, the totals, Clear plate.
class _Body extends StatelessWidget {
  final Store store;
  final Fixture fx;
  final void Function(Plate, PlateItem) onDish;
  const _Body({super.key, required this.store, required this.fx, required this.onDish});

  @override
  Widget build(BuildContext context) {
    final plates = store.plates.plates, pl = plates[store.plates.front], hs = plateHalls(pl), t = totals(pl);
    return Arrive(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.plateBodyTop, M2Space.gutter, 0),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (plates.length > 1)
            Padding(
              padding: const EdgeInsets.only(left: M2Layout.plateTabsInset, right: M2Layout.plateTabsInset, bottom: M2Layout.plateTabsBottom),
              child: Wrap(spacing: M2Layout.plateTabGap, children: [
                for (var i = 0; i < plates.length; i++)
                  Press(
                    label: plateLabel(fx, plates[i]), onTap: () { store.setFront(i); Haptics.selection(); },
                    child: Container(
                      height: M2Size.tap, padding: const EdgeInsets.symmetric(horizontal: M2Layout.plateTabPad), alignment: Alignment.center,
                      child: Stack(alignment: Alignment.bottomCenter, children: [
                        Center(child: Text(plateLabel(fx, plates[i]), style: M2Text.link.style(i == store.plates.front ? M2Color.dm : M2Color.slate))),
                        if (i == store.plates.front) const Padding(padding: EdgeInsets.only(bottom: M2Layout.plateTabUnderBottom), child: SizedBox(height: M2Layout.plateTabUnder, width: double.infinity, child: ColoredBox(color: M2Color.vm))),
                      ]),
                    ),
                  ),
              ]),
            ),
          for (final it in pl.items) _PlateRow(key: ValueKey('${pl.id}.${it.key}'), store: store, plate: pl, item: it, cal: macroOf(it, hs?.first).cal, onOpen: () => onDish(pl, it)),
          Padding(padding: const EdgeInsets.symmetric(vertical: M2Layout.factsMargin), child: Facts(cal: t.cal, p: t.p, c: t.c, f: t.f)),
          Align(alignment: Alignment.centerRight, child: TextAction('Clear plate', onTap: () { store.clearPlate(); Haptics.remove(); })),
        ]),
      ),
    );
  }
}

/// `.prow`: an item on the plate, its calories each, and its stepper. Taking the last half away closes the row up on `exit` first.
class _PlateRow extends StatefulWidget {
  final Store store;
  final Plate plate;
  final PlateItem item;
  final num cal;
  final VoidCallback onOpen;
  const _PlateRow({super.key, required this.store, required this.plate, required this.item, required this.cal, required this.onOpen});
  @override
  State<_PlateRow> createState() => _PlateRowState();
}

class _PlateRowState extends State<_PlateRow> with SingleTickerProviderStateMixin {
  late final AnimationController _out = AnimationController(vsync: this);

  @override
  void dispose() {
    _out.dispose();
    super.dispose();
  }

  void _dec() {
    final w = widget;
    Haptics.remove();
    if (w.item.qty == 0.5) {
      final a = resolveAnim(context, M2Motion.exit);
      _out.duration = a.duration;
      _out.forward().then((_) => w.store.step(w.plate.id, w.item.key, -1));
    } else {
      w.store.step(w.plate.id, w.item.key, -1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final w = widget, a = resolveAnim(context, M2Motion.exit);
    return AnimatedBuilder(
      animation: _out,
      builder: (_, child) {
        final v = a.curve.transform(_out.value);
        return ClipRect(child: Align(alignment: Alignment.topCenter, heightFactor: 1 - v, child: Opacity(opacity: 1 - v, child: child)));
      },
      child: Press(
        overlay: M2Color.pressRow, label: '${w.item.name}, ${fc(w.cal)} calories each', onTap: w.onOpen,
        child: Container(
          constraints: const BoxConstraints(minHeight: M2Layout.prowMin),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
          child: Row(children: [
            Expanded(
              child: ExcludeSemantics(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(w.item.name, style: M2Text.rowName.style(M2Color.ink)),
                  Padding(
                    padding: const EdgeInsets.only(top: M2Layout.prowMetaTop),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                      Text(fc(w.cal), style: M2Text.metaNum.style(M2Color.ink)), const SizedBox(width: M2Layout.numSpace), Text('cal each', style: M2Text.meta.style(M2Color.slate)),
                    ]),
                  ),
                ]),
              ),
            ),
            const SizedBox(width: M2Layout.prowGap),
            Stepper(qty: w.item.qty, onDec: _dec, onInc: () { w.store.step(w.plate.id, w.item.key, 1); Haptics.add(); }),
          ]),
        ),
      ),
    );
  }
}
