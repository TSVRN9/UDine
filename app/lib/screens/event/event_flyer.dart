import 'package:flutter/widgets.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// An event's flyer in full on the event page: fit to the width at its own aspect ratio, never cropped, in the banner's white ring and felt.
/// The picture is UMass Dining's, so it follows [Photos.enabled]; with it off, or until it loads, the felt ground holds a letter sheet's
/// room. A flyer that fails to load draws nothing at all.
class FlyerPicture extends StatefulWidget {
  const FlyerPicture({super.key, required this.url});
  final String url;
  @override
  State<FlyerPicture> createState() => _FlyerPictureState();
}

class _FlyerPictureState extends State<FlyerPicture> {
  bool _failed = false;

  @override
  Widget build(BuildContext context) {
    if (_failed) return const SizedBox.shrink();
    const ground = AspectRatio(
      key: ValueKey('flyer-ground'),
      aspectRatio: M2Layout.flyer,
      child: ColoredBox(color: M2Color.vm),
    );
    final pic = Photos.enabled
        ? Image.network(
            widget.url,
            fit: BoxFit.fitWidth,
            width: double.infinity,
            frameBuilder: (_, child, frame, sync) =>
                frame == null && !sync ? ground : child,
            loadingBuilder: (_, child, p) => p == null ? child : ground,
            errorBuilder: (_, _, _) {
              WidgetsBinding.instance.addPostFrameCallback(
                (_) => mounted ? setState(() => _failed = true) : null,
              );
              return ground;
            },
          )
        : ground;
    return DecoratedBox(
      decoration: const BoxDecoration(
        borderRadius: BorderRadius.all(Radius.circular(M2Felt.frameRadius)),
        boxShadow: [BoxShadow(color: M2Color.white, spreadRadius: M2Size.ring)],
      ),
      child: Felt(
        color: M2Color.vm,
        stitch: M2Color.stitchGold,
        radius: M2Felt.frameRadius,
        inset: M2Felt.frameInset,
        innerRadius: M2Felt.frameStitchRadius,
        stitchWidth: M2Felt.frameStitchWidth,
        padding: const EdgeInsets.all(M2Felt.framePad),
        child: ClipRRect(
          borderRadius: const BorderRadius.all(Radius.circular(M2Radius.image)),
          child: pic,
        ),
      ),
    );
  }
}
