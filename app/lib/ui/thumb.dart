import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'photo.dart';

/// `.thumb`: a place's photo at 64 x 34, rounded; hair ground while the photo is missing, maroon for a place that has none (`nophoto`).
class Thumb extends StatelessWidget {
  final String? path;
  const Thumb({super.key, this.path});
  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: const BorderRadius.all(Radius.circular(M2Radius.thumb)),
        child: SizedBox(
          width: M2Layout.thumbW, height: M2Layout.thumbH,
          child: ColoredBox(
            color: path == null ? M2Color.vm : M2Color.hair,
            child: path == null || !Photos.enabled ? null : Image.asset(path!, fit: BoxFit.cover, errorBuilder: (_, _, _) => const SizedBox.shrink()),
          ),
        ),
      );
}
