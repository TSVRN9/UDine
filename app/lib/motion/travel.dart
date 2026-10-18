import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'container_math.dart';

/// A shared element of a hall opening from its band (M2 R13 `paint()` / `measureXF()`): the letter, the title, the status line or the
/// busy meter, drawn at full opacity along the straight line from where the card drew it to where the header draws it. `card` is the
/// card's copy of the element, laid out (never painted) in the same header, so both rects are read in the one frame the transform is
/// drawn and the first frame is already the card. `anchor` is the part of this child the card's element matches (the status line's text
/// inside its padding and chevron); the child itself when null. `lift` is the header's scroll offset, which M2 leaves the element out of.
class Travel extends SingleChildRenderObjectWidget {
  const Travel({super.key, required this.progress, required this.header, required this.card, this.anchor, this.scale = false, this.lift, super.child});
  final Animation<double> progress;
  final GlobalKey header;
  final GlobalKey? card, anchor;
  final bool scale;
  final ValueListenable<double>? lift;

  @override
  RenderObject createRenderObject(BuildContext context) => RenderTravel(progress, header, card, anchor, scale, lift);

  @override
  void updateRenderObject(BuildContext context, RenderTravel renderObject) => renderObject
    ..progress = progress
    ..header = header
    ..card = card
    ..anchor = anchor
    ..scale = scale
    ..lift = lift;
}

class RenderTravel extends RenderProxyBox {
  RenderTravel(this._progress, this.header, this.card, this.anchor, this.scale, this._lift);
  Animation<double> _progress;
  ValueListenable<double>? _lift;
  GlobalKey header;
  GlobalKey? card, anchor;
  bool scale;

  /// Where the element was last drawn toward (header coordinates), for tests.
  @visibleForTesting
  Rect? lastHome;

  set progress(Animation<double> v) {
    if (identical(v, _progress)) return;
    if (attached) _progress.removeListener(markNeedsPaint);
    _progress = v;
    if (attached) v.addListener(markNeedsPaint);
    markNeedsPaint();
  }

  set lift(ValueListenable<double>? v) {
    if (identical(v, _lift)) return;
    if (attached) _lift?.removeListener(markNeedsPaint);
    _lift = v;
    if (attached) v?.addListener(markNeedsPaint);
    markNeedsPaint();
  }

  @override
  void attach(PipelineOwner owner) {
    super.attach(owner);
    _progress.addListener(markNeedsPaint);
    _lift?.addListener(markNeedsPaint);
  }

  @override
  void detach() {
    _progress.removeListener(markNeedsPaint);
    _lift?.removeListener(markNeedsPaint);
    super.detach();
  }

  RenderBox? _box(GlobalKey? k) {
    final o = k?.currentContext?.findRenderObject();
    return o is RenderBox && o.attached && o.hasSize ? o : null;
  }

  /// The element's transform in its own coordinates, or null once it is home (or when there is no card to come from).
  Matrix4? get _matrix {
    final p = _progress.value;
    if (p >= 1 || !hasSize) return null;
    final h = _box(header), c = _box(card), a = anchor == null ? this : _box(anchor);
    if (h == null || c == null || a == null) return null;
    // (measured from the child: a path that ends at this box applies this box's own transform, which is what is being worked out)
    final home = a == this ? Offset.zero : a.localToGlobal(Offset.zero, ancestor: child), at = localToGlobal(Offset.zero, ancestor: h) + home;
    lastHome = at & a.size;
    final s = sharedAt(c.localToGlobal(Offset.zero, ancestor: h) & c.size, lastHome!, p, scale: scale);
    return Matrix4.translationValues(home.dx + s.dx, home.dy + s.dy + (_lift?.value ?? 0), 0)
      ..scaleByDouble(s.k, s.k, 1, 1)
      ..translateByDouble(-home.dx, -home.dy, 0, 1);
  }

  @override
  void paint(PaintingContext context, Offset offset) {
    final m = _matrix;
    if (m == null || child == null) {
      layer = null;
      return super.paint(context, offset);
    }
    final t = Matrix4.translationValues(offset.dx, offset.dy, 0)
      ..multiply(m)
      ..translateByDouble(-offset.dx, -offset.dy, 0, 1);
    layer = context.pushTransform(needsCompositing, offset, t, super.paint, oldLayer: layer is TransformLayer ? layer as TransformLayer : null);
  }

  @override
  bool hitTestChildren(BoxHitTestResult result, {required Offset position}) {
    final m = _matrix;
    if (m == null) return super.hitTestChildren(result, position: position);
    return result.addWithPaintTransform(transform: m, position: position, hitTest: (r, pos) => child!.hitTest(r, position: pos));
  }

  @override
  void applyPaintTransform(RenderBox child, Matrix4 transform) {
    final m = _matrix;
    if (m != null) transform.multiply(m);
  }
}
