import 'dart:async';
import 'dart:io';
import 'package:flutter/widgets.dart';
import '../../data/pdf_cache.dart';
import '../../data/states.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// An event's banner on its felt patch (M2 `.evpatch`): 1024:432 under the white ring, the gold stitch run over the picture on a Search card
/// and in the felt around it on the page (`framed`: 7 dp of felt, M2 `.page[data-p=event] .evpatch`). The picture is UMass Dining's, so it
/// follows [Photos.enabled]; with it off the maroon felt and stitch are all that draws. [cache] is where it is kept on the phone: a saved picture
/// draws in the first frame; one still coming shimmers on the felt, then fades in over `settle`; none (offline, a bad answer) leaves the felt.
class EventBanner extends StatelessWidget {
  const EventBanner({super.key, required this.image, this.cache, this.framed = false});
  final String image;
  final PdfCache? cache;
  final bool framed;

  @override
  Widget build(BuildContext context) {
    final c = cache;
    final pic = (Photos.enabled || Photos.pending) && image.isNotEmpty && c != null ? _Picture(image, c, key: ValueKey(image)) : const SizedBox.expand();
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

class _Picture extends StatefulWidget {
  const _Picture(this.url, this.cache, {super.key});
  final String url;
  final PdfCache cache;
  @override
  State<_Picture> createState() => _PictureState();
}

class _PictureState extends State<_Picture> with SingleTickerProviderStateMixin {
  late final AnimationController _sweep;
  StreamSubscription<DataState<File>>? _sub;
  File? _file;
  late final bool _saved = widget.cache.file(widget.url).existsSync();
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _sweep = AnimationController(vsync: this, duration: EventShimmer.sweep.duration);
    if (_saved) return;
    _loading = true;
    _sub = widget.cache.open(widget.url).listen((s) {
      if (!mounted) return;
      setState(() {
        _loading = s is Loading<File> || s is StillLoading<File>;
        if (s is Loaded<File>) _file = s.value;
      });
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _sweep.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    Widget draw(File f) => Image.file(f, fit: BoxFit.cover, width: double.infinity, height: double.infinity, errorBuilder: (_, _, _) => const SizedBox.shrink());
    if (_saved) return draw(widget.cache.file(widget.url));
    final still = MediaQuery.disableAnimationsOf(context);
    if (_loading && !still && !_sweep.isAnimating) _sweep.repeat();
    if ((!_loading || still) && _sweep.isAnimating) _sweep.stop();
    return Stack(fit: StackFit.expand, children: [
      if (_loading)
        still
            ? ColoredBox(key: const ValueKey('ev-still'), color: M2Color.white.withValues(alpha: EventShimmer.stillAlpha))
            : AnimatedBuilder(
                animation: _sweep,
                builder: (_, _) => DecoratedBox(
                  key: const ValueKey('ev-sweep'),
                  decoration: BoxDecoration(gradient: LinearGradient(colors: [M2Color.white.withValues(alpha: 0), M2Color.white.withValues(alpha: EventShimmer.bandAlpha), M2Color.white.withValues(alpha: 0)], transform: _Slide(EventShimmer.sweep.curve.transform(_sweep.value)))),
                ),
              ),
      AnimatedOpacity(
        opacity: _file == null ? 0 : 1,
        duration: M2Motion.settle.duration,
        curve: M2Motion.settle.curve,
        child: _file == null ? const SizedBox.expand() : draw(_file!),
      ),
    ]);
  }
}

/// The gradient squeezed to [EventShimmer.bandWidth] of the box and moved from just off its left edge to just off its right at [t] (0..1).
class _Slide extends GradientTransform {
  const _Slide(this.t);
  final double t;
  @override
  Matrix4 transform(Rect bounds, {TextDirection? textDirection}) =>
      Matrix4.identity()..translateByDouble(bounds.width * (t * (1 + EventShimmer.bandWidth) - EventShimmer.bandWidth), 0, 0, 1)..scaleByDouble(EventShimmer.bandWidth, 1, 1, 1);
}
