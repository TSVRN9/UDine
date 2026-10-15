import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import 'press.dart';
import 'thumb.dart';

/// `.prow2`: a place in Search's results: its thumbnail, name over a second line, and its status on the right (maroon while open,
/// slate when not). 60 dp at least, a hairline from 20 dp in.
class PlaceRow extends StatelessWidget {
  final String name, detail, status;
  final bool open;
  /// a line that is a matched item, not a building: kept to one line
  final bool clampDetail;
  final String? photo;
  final VoidCallback? onTap;
  const PlaceRow({super.key, required this.name, required this.detail, required this.status, required this.open, this.clampDetail = false, this.photo, this.onTap});

  @override
  Widget build(BuildContext context) => Press(
        overlay: M2Color.pressRow, onTap: onTap, label: [name, detail, status].where((s) => s.isNotEmpty).join(', '),
        child: Stack(children: [
          Container(
            constraints: const BoxConstraints(minHeight: M2Layout.placeRowMin),
            padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter, vertical: M2Layout.placeRowPadV),
            child: ExcludeSemantics(
              child: Row(children: [
                Thumb(path: photo),
                const SizedBox(width: M2Layout.thumbGap),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name, style: M2Text.rowName.normal().style(M2Color.ink)),
                    Padding(padding: const EdgeInsets.only(top: M2Layout.placeTextTop), child: Text(detail, maxLines: clampDetail ? 1 : null, overflow: clampDetail ? TextOverflow.ellipsis : TextOverflow.clip, style: M2Text.meta.style(M2Color.slate))),
                  ]),
                ),
                const SizedBox(width: M2Layout.placeRowGap),
                if (status.isNotEmpty) Text(status, maxLines: 1, style: (open ? M2Layout.placeStatus : M2Text.statusSm).style(open ? M2Color.vm : M2Color.slate)),
              ]),
            ),
          ),
          const Positioned(left: M2Space.gutter, right: 0, bottom: 0, height: M2Layout.hairline, child: ColoredBox(color: M2Color.hair)),
        ]),
      );
}
