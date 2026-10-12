import 'package:flutter/widgets.dart';

/// A scroll controller that is already at its landing offset the first time its list is laid out: no frame draws the list at the
/// top and then moves it (a hall pushed from where-served arrives at its dish in one motion). `landing` runs inside the viewport's
/// layout, after the children are laid out, with the maximum extent; null leaves the list at the top.
class LandingScrollController extends ScrollController {
  LandingScrollController({this.landing});
  double? Function(double maxExtent)? landing;

  @override
  ScrollPosition createScrollPosition(ScrollPhysics physics, ScrollContext context, ScrollPosition? oldPosition) =>
      _LandingPosition(physics: physics, context: context, oldPosition: oldPosition, owner: this);
}

class _LandingPosition extends ScrollPositionWithSingleContext {
  _LandingPosition({required super.physics, required super.context, super.oldPosition, required this.owner});
  final LandingScrollController owner;
  bool _landed = false;

  @override
  bool applyContentDimensions(double minScrollExtent, double maxScrollExtent) {
    if (!_landed && maxScrollExtent > 0) {
      _landed = true;
      final to = owner.landing?.call(maxScrollExtent);
      if (to != null) correctPixels(to.clamp(minScrollExtent, maxScrollExtent));
    }
    return super.applyContentDimensions(minScrollExtent, maxScrollExtent);
  }
}
