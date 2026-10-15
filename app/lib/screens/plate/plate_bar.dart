import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/log.dart';
import '../../core/m2/plate.dart';
import '../../shell/plate_model.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// The plate bar (M2 `#bar`): the plate's label, items, calories and protein over Log; "Log at" and a button per place when the plate
/// serves several; the receipt with Undo after Log. It is the plate sheet's top edge, so it is built to be the sheet's pinned header
/// and to stand alone at the sheet's lowest height. Swiping it sideways steps through the plates (a rubber band when there is one).
class PlateBar extends StatefulWidget {
  final PlateModel model;
  final Board fx;

  /// "Log at" is showing (the plate serves several places and Log was tapped)
  final bool choose;
  final VoidCallback onLog, onUnchoose, onUndo, onOpen, onRetry;
  final ValueChanged<String> onLogAt;

  const PlateBar({
    super.key,
    required this.model,
    required this.fx,
    required this.choose,
    required this.onLog,
    required this.onLogAt,
    required this.onUnchoose,
    required this.onUndo, required this.onRetry,
    required this.onOpen,
  });
  @override
  State<PlateBar> createState() => _PlateBarState();
}

class _PlateBarState extends State<PlateBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _a = AnimationController(vsync: this);
  double _dx = 0, _from = 0;
  int _dir = 0;
  bool _entering = false;

  PlateModel get m => widget.model;

  @override
  void dispose() {
    _a.dispose();
    super.dispose();
  }

  void _drag(DragUpdateDetails d) {
    _a.stop();
    _entering = false;
    final n = m.state.plates.length;
    setState(
      () => _dx += n > 1 ? d.delta.dx : d.delta.dx * M2Motion.plateSwipeRubber,
    );
  }

  void _end(DragEndDetails d) {
    final n = m.state.plates.length,
        vx = d.velocity.pixelsPerSecond.dx / 1000; // (M2 reads px/ms)
    final a = resolveAnim(context, M2Motion.settle);
    if (n > 1 &&
        (_dx.abs() > M2Motion.plateSwipeCommit ||
            vx.abs() > M2Motion.plateSwipeFlick)) {
      _dir = _dx < 0 ? 1 : -1;
      Haptics.selection();
      m.setFront((m.state.front + _dir + n) % n);
      _entering = true;
      _from = _dir * M2Motion.plateSwipeShift;
    } else {
      _entering = false;
      _from = _dx;
    }
    _dx = 0;
    _a.duration = a.duration;
    _a.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final r = m.receipt,
        f = m.failure,
        s = m.state,
        plate = s.front < s.plates.length ? s.plates[s.front] : null;
    final many = s.plates.length > 1 && r == null && f == null;
    final Widget body = f != null
        ? _failed(f)
        : r != null
        ? _receipt(r)
        : plate == null
        ? const SizedBox(height: M2Layout.barMin)
        : widget.choose
        ? _choose(plate)
        : _plate(plate);
    final curve = M2Motion.settle.curve;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: r == null && f == null && !widget.choose ? widget.onOpen : null,
      onHorizontalDragUpdate: r == null && f == null && !widget.choose ? _drag : null,
      onHorizontalDragEnd: r == null && f == null && !widget.choose ? _end : null,
      child: ColoredBox(
        color: M2Color.dm,
        child: Stack(
          children: [
            AnimatedBuilder(
              animation: _a,
              builder: (_, c) {
                final t = curve.transform(_a.value),
                    settling = _a.isAnimating || _a.value > 0;
                final off = settling ? _from * (1 - t) : _dx;
                return Transform.translate(
                  offset: Offset(off, 0),
                  child: Opacity(
                    opacity: settling && _entering ? t : 1,
                    child: c,
                  ),
                );
              },
              child: Arrive(key: ValueKey((r != null, f)), child: body),
            ),
            if (many)
              Positioned(
                left: 0,
                right: 0,
                top: M2Layout.dotsTop,
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < s.plates.length; i++) ...[
                      if (i > 0) const SizedBox(width: M2Layout.dotGap),
                      Container(
                        width: M2Layout.dotSize,
                        height: M2Layout.dotSize,
                        decoration: BoxDecoration(
                          color: i == s.front ? M2Color.gold : M2Color.dotOff,
                          borderRadius: const BorderRadius.all(
                            Radius.circular(M2Layout.peekRadius),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _frame(Widget txt, Widget acts) => ConstrainedBox(
    constraints: const BoxConstraints(minHeight: M2Layout.barMin),
    child: Padding(
      padding: const EdgeInsets.fromLTRB(
        M2Space.gutter,
        M2Layout.barPadTop,
        M2Layout.barPadRight,
        M2Layout.barPadTop,
      ),
      child: Row(
        children: [
          Expanded(child: txt),
          const SizedBox(width: M2Layout.barGap),
          acts,
        ],
      ),
    ),
  );

  Widget _l2(List<(String, String)> parts, ) {
    final num = M2Text.barNum.style(M2Color.white),
        unit = M2Text.meta.style(M2Color.onDm);
    return Padding(
      padding: const EdgeInsets.only(top: M2Layout.barL2Top),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.baseline,
        textBaseline: TextBaseline.alphabetic,
        children: [
          for (var i = 0; i < parts.length; i++) ...[
            if (i > 0) const SizedBox(width: M2Layout.barUnitGap),
            Text(parts[i].$1, style: num),
            const SizedBox(width: M2Layout.barNumGap),
            Text(parts[i].$2, style: unit),
          ],
        ],
      ),
    );
  }

  Widget _plate(Plate p) {
    final t = totals(p), n = t.n == 1 ? '1 item' : '${fq(t.n)} items';
    return _frame(
      Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${plateLabel(widget.fx, p)}, $n',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: M2Text.meta.style(M2Color.onDm),
          ),
          _l2([
            (fc(t.cal), 'cal'),
            ('${f1(t.p)}g', 'protein'),
          ]),
        ],
      ),
      Button(kind: ButtonKind.gold, label: 'Log', onTap: widget.onLog),
    );
  }

  Widget _choose(Plate p) => _frame(
    Press(
      label: 'Back',
      onTap: widget.onUnchoose,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: M2Layout.btnM),
        child: Align(
          alignment: Alignment.centerLeft,
          child: Text('Log at', style: M2Text.meta.style(M2Color.onDm)),
        ),
      ),
    ),
    Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final (i, h) in (plateHalls(p) ?? const <String>[]).indexed) ...[
          if (i > 0) const SizedBox(width: M2Space.part),
          Button(
            kind: ButtonKind.gold,
            compact: true,
            label: placeName(widget.fx, h),
            onTap: () => widget.onLogAt(h),
          ),
        ],
      ],
    ),
  );

  Widget _receipt(Receipt r) => _frame(
    Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          receiptLine(widget.fx, r.place, r.plate.meal),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: M2Text.meta.style(M2Color.onDm),
        ),
        Padding(
          padding: const EdgeInsets.only(top: M2Layout.barL2Top),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text('Today ', style: M2Text.meta.style(M2Color.onDm)),
              Text(fc(r.dayCal), style: M2Text.barNum.style(M2Color.white)),
              const SizedBox(width: M2Layout.barNumGap),
              Text('cal', style: M2Text.meta.style(M2Color.onDm)),
            ],
          ),
        ),
      ],
    ),
    Button(kind: ButtonKind.outline, label: 'Undo', onTap: widget.onUndo),
  );

  Widget _failed(PlateFailure f) => _frame(
        Text(f == PlateFailure.log ? "Couldn't save this meal." : "Couldn't undo.", style: M2Text.meta.style(M2Color.onDm)),
        Button(kind: ButtonKind.outline, label: 'Try again', onTap: widget.onRetry),
      );
}
