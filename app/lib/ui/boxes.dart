import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

/// CSS negative margins, which Flutter's Padding refuses: the child keeps its own size and is drawn `top` dp up (negative) and the
/// box is that much shorter above and `bottom` shorter below. The part of the child outside the box still takes touches, so a
/// padded 42 dp button pulled back by its margins (`#mts`) stays a 42 dp target.
class NegMargin extends SingleChildRenderObjectWidget {
  final double top, bottom;
  const NegMargin({super.key, this.top = 0, this.bottom = 0, required Widget super.child}) : assert(top <= 0 && bottom <= 0);
  @override
  RenderObject createRenderObject(BuildContext context) => RenderNegMargin(top, bottom);
  @override
  void updateRenderObject(BuildContext context, covariant RenderNegMargin renderObject) => renderObject
    ..top = top
    ..bottom = bottom;
}

class RenderNegMargin extends RenderShiftedBox {
  RenderNegMargin(this._top, this._bottom) : super(null);
  double _top, _bottom;
  set top(double v) {
    if (v == _top) return;
    _top = v;
    markNeedsLayout();
  }

  set bottom(double v) {
    if (v == _bottom) return;
    _bottom = v;
    markNeedsLayout();
  }

  @override
  void performLayout() {
    final c = child;
    if (c == null) {
      size = constraints.smallest;
      return;
    }
    c.layout(constraints.loosen().copyWith(minHeight: 0), parentUsesSize: true);
    size = constraints.constrain(Size(c.size.width, c.size.height + _top + _bottom));
    (c.parentData! as BoxParentData).offset = Offset(0, _top);
  }

  @override
  double computeMinIntrinsicHeight(double width) => (child?.getMinIntrinsicHeight(width) ?? 0) + _top + _bottom;
  @override
  double computeMaxIntrinsicHeight(double width) => (child?.getMaxIntrinsicHeight(width) ?? 0) + _top + _bottom;

  @override
  bool hitTest(BoxHitTestResult result, {required Offset position}) {
    final c = child;
    if (c == null) return false;
    final hit = result.addWithPaintOffset(offset: (c.parentData! as BoxParentData).offset, position: position, hitTest: (r, p) => c.hitTest(r, position: p));
    if (hit) result.add(BoxHitTestEntry(this, position));
    return hit;
  }
}

/// A box that says where its baseline is, `baseline` dp from its top: CSS's inline-grid takes the baseline of its first item, and a
/// `vertical-align` lowers it from there; a Flutter box with no text has none, so a baseline-aligned row would use its bottom.
class BaselineAt extends SingleChildRenderObjectWidget {
  final double baseline;
  const BaselineAt({super.key, required this.baseline, required Widget super.child});
  @override
  RenderObject createRenderObject(BuildContext context) => RenderBaselineAt(baseline);
  @override
  void updateRenderObject(BuildContext context, covariant RenderBaselineAt renderObject) => renderObject.baseline = baseline;
}

class RenderBaselineAt extends RenderProxyBox {
  RenderBaselineAt(this._baseline);
  double _baseline;
  set baseline(double v) {
    if (v == _baseline) return;
    _baseline = v;
    markParentNeedsLayout();
  }

  @override
  double? computeDistanceToActualBaseline(TextBaseline baseline) => _baseline;
  @override
  double? computeDryBaseline(BoxConstraints constraints, TextBaseline baseline) => _baseline;
}
