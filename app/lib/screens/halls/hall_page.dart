import 'package:flutter/widgets.dart';

import '../../motion/container_math.dart';
import '../../motion/routes.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'halls_model.dart';

/// The page a band opens into, until `flutter-port-hall-menu` builds it: the maroon header the band is a window into, the band's own
/// copy fading out over it (CONCEPT "Motion vocabulary": 0 to .3), and Back.
class HallPage extends StatelessWidget {
  const HallPage({super.key, required this.band, required this.page, required this.top});
  final BandVM band;
  final CardPage page;
  final double top;

  @override
  Widget build(BuildContext context) {
    final cafe = band.isCafe, photo = photoOf(band.key, band.name);
    return Stack(children: [
      const Positioned.fill(child: ColoredBox(color: M2Color.chalk)),
      Positioned(
        left: 0, right: 0, top: 0, height: headerHeight(top),
        child: ColoredBox(
          color: M2Color.vm,
          // the photo is the shared element: it stays where the band showed it, and its duotone develops into colour as the page opens
          child: photo == null ? null : Photo(path: photo, pos: cafe ? M2Layout.cafePhotoPos : photoPos[band.key]!, duo: ReverseAnimation(page.progress)),
        ),
      ),
      Positioned(
        left: 0, right: 0, top: page.rect.off, height: cafe ? M2Layout.bandCompact : M2Size.band,
        child: AnimatedBuilder(
          animation: page.progress,
          builder: (_, c) => Opacity(opacity: outgoingOpacity(page.progress.value), child: c),
          child: Band(ghost: true, compact: cafe, name: band.name, status: band.status, letter: cafe ? null : HallLetter(letter: band.key, x: hallLx[band.key]!)),
        ),
      ),
      Positioned(left: 0, top: top, child: BackButton(onTap: page.close)),
    ]);
  }
}

/// A pushed page, until `flutter-port-cafes` builds the area's list: the maroon bar with Back and the area's name.
class AreaPage extends StatelessWidget {
  const AreaPage({super.key, required this.title, required this.top});
  final String title;
  final double top;

  @override
  Widget build(BuildContext context) => Column(children: [
        ScreenHeader.page(top: top, title: title, onBack: () => Navigator.of(context).maybePop()),
        const Expanded(child: ColoredBox(color: M2Color.chalk, child: SizedBox.expand())),
      ]);
}
