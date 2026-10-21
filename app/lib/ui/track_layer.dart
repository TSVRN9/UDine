import 'package:flutter/widgets.dart';
import '../motion/track_lift.dart';

/// What the tracking layer is doing now (M2 R13 §3), for a widget that is part of it. With no clock (a widget built on its own) the layer is
/// at rest: whole when [rest], gone otherwise. The builder runs on every frame of the lift and never otherwise.
class LiftBuilder extends StatelessWidget {
  const LiftBuilder({super.key, required this.lift, this.rest = true, required this.builder, this.child});
  final TrackLift? lift;
  final bool rest;
  final Widget Function(BuildContext context, LiftFrame frame, Widget? child) builder;
  final Widget? child;
  @override
  Widget build(BuildContext context) {
    final l = lift;
    if (l == null) return builder(context, rest ? liftWhole : liftGone, child);
    return ListenableBuilder(listenable: l, child: child, builder: (c, ch) => builder(c, l.frame, ch));
  }
}

/// A block that is there only while tracking is on (a You section, the Health row): it fades to nothing, then closes its height; on, it opens
/// empty and then fades in. At rest off it is not in the tree.
class LiftFold extends StatelessWidget {
  const LiftFold({super.key, required this.lift, this.rest = true, required this.child});
  final TrackLift? lift;
  final bool rest;
  final Widget child;
  @override
  Widget build(BuildContext context) => LiftBuilder(
        lift: lift, rest: rest, child: child,
        builder: (_, f, c) => f.size == 0 && f.alpha == 0
            ? const SizedBox.shrink()
            : f.size == 1 && f.alpha == 1
            ? c!
            : ClipRect(child: Align(alignment: Alignment.topCenter, heightFactor: f.size, child: Opacity(opacity: f.alpha, child: c))),
      );
}
