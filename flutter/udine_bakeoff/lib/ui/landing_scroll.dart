import 'package:flutter/widgets.dart';

/// A scroll controller that is already at its landing offset the first time its list is laid out: no frame draws the list at the top
/// and then moves it (a hall pushed from where-served arrives at its dish in one motion). `landing` runs inside the viewport's layout,
/// after the children are laid out, with the maximum extent and where the list is now; it answers the offset it wants (an estimate
/// until the row it is after has been built, then the row's exact one) or null when it has landed. Each answer that moves the list
/// makes the viewport lay out again in the same frame, so a lazy list converges before it is painted.
class LandingScrollController extends ScrollController {
  LandingScrollController({this.landing});
  double? Function(double maxExtent, double pixels)? landing;

  @override
  ScrollPosition createScrollPosition(ScrollPhysics physics, ScrollContext context, ScrollPosition? oldPosition) =>
      _LandingPosition(physics: physics, context: context, oldPosition: oldPosition, owner: this);
}

class _LandingPosition extends ScrollPositionWithSingleContext {
  _LandingPosition({required super.physics, required super.context, super.oldPosition, required this.owner});
  final LandingScrollController owner;
  bool _landed = false;
  int _tries = 0;

  @override
  bool applyContentDimensions(double minScrollExtent, double maxScrollExtent) {
    var moved = false;
    if (!_landed && owner.landing != null) {
      final want = owner.landing!(maxScrollExtent, pixels);
      if (want == null || ++_tries > 8) {
        _landed = true;
      } else {
        final to = want.clamp(minScrollExtent, maxScrollExtent);
        if ((to - pixels).abs() < 0.5) {
          _landed = true;
        } else {
          correctBy(to - pixels);
          moved = true;
        }
      }
    }
    final ok = super.applyContentDimensions(minScrollExtent, maxScrollExtent);
    // correctBy is silent: whoever follows the offset (a header that collapses with it) is told once the layout is done
    if (moved) WidgetsBinding.instance.addPostFrameCallback((_) => hasPixels ? notifyListeners() : null);
    return ok;
  }
}
