import 'package:flutter/widgets.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// An event's banner on its felt patch (M2 `.evpatch`): 1024:432 under the white ring, the gold stitch run over the picture on a Search card
/// and in the felt around it on the page (`framed`: 7 dp of felt, M2 `.page[data-p=event] .evpatch`). The picture is UMass Dining's, so it
/// follows [Photos.enabled]; with it off the maroon felt and stitch are all that draws.
class EventBanner extends StatelessWidget {
  const EventBanner({super.key, required this.image, this.framed = false});
  final String image;
  final bool framed;

  @override
  Widget build(BuildContext context) {
    final pic = Photos.enabled && image.isNotEmpty
        ? Image.network(image, fit: BoxFit.cover, width: double.infinity, height: double.infinity, errorBuilder: (_, _, _) => const SizedBox.shrink())
        : const SizedBox.expand();
    return DecoratedBox(
      // the white ring is outside the patch (`box-shadow: 0 0 0 3px #fff`), so it takes no room
      decoration: const BoxDecoration(borderRadius: BorderRadius.all(Radius.circular(M2Felt.frameRadius)), boxShadow: [BoxShadow(color: M2Color.white, spreadRadius: M2Size.ring)]),
      child: AspectRatio(
        aspectRatio: M2Layout.evBanner,
        child: framed
            ? Felt(
                color: M2Color.vm, stitch: M2Color.stitchGold, radius: M2Felt.frameRadius, inset: M2Felt.frameInset, innerRadius: M2Felt.frameStitchRadius, stitchWidth: M2Felt.frameStitchWidth,
                padding: const EdgeInsets.all(M2Felt.framePad),
                child: ClipRRect(borderRadius: const BorderRadius.all(Radius.circular(M2Radius.image)), child: pic),
              )
            : ClipRRect(
                borderRadius: const BorderRadius.all(Radius.circular(M2Felt.frameRadius)),
                child: Stack(fit: StackFit.expand, children: [
                  const ColoredBox(color: M2Color.vm),
                  pic,
                  Felt(color: M2Layout.clear, stitch: M2Color.stitchGold, radius: M2Felt.frameRadius, inset: M2Layout.evCardInset, innerRadius: M2Felt.frameStitchRadius, stitchWidth: M2Felt.frameStitchWidth),
                ]),
              ),
      ),
    );
  }
}
