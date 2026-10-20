import 'package:flutter/widgets.dart';
import '../event/event_page.dart' show openEvent;

import '../../motion/routes.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../hall/hall_menu.dart';
import 'halls_model.dart';

/// The band's window into its page's header photo (M2 `.win`): the photo at header size, offset so the pixels line up when it opens.
Widget? bandPhoto(BandVM b, double top) {
  final path = photoOf(b.key, b.name);
  if (path == null) return null;
  return Positioned(left: 0, right: 0, top: -bandOff(b.key, top), height: headerHeight(top), child: Photo(path: path, pos: b.isCafe ? M2Layout.cafePhotoPos : photoPos[b.key]!));
}

/// The page a band opens into: the hall's menu (`HallMenu`) hung from the band's photo by the container transform, its letter, title,
/// status line and busy meter travelling from where the card drew them (M2 R13 §4), and Back. A café with dishes is the same page.
class HallPage extends StatefulWidget {
  const HallPage({super.key, required this.band, required this.page, required this.top, this.card = false});
  final BandVM band;
  final CardPage page;
  final double top;
  /// opened from Search's 76 dp hall card: its copy fades out over the page, not the 112 band's
  final bool card;

  @override
  State<HallPage> createState() => _HallPageState();
}

class _HallPageState extends State<HallPage> {
  final _menu = GlobalKey<HallMenuState>();
  late final _parts = BandParts(hasLetter: !widget.band.isCafe && !widget.card, hasStatus: widget.band.status?.isNotEmpty ?? false, hasMeter: widget.band.lamps != null);

  @override
  void initState() {
    super.initState();
    // a drag down takes the screen only while the list is at its top (M2: `sc.scrollTop <= 0`)
    widget.page.canDragDown = () => _menu.currentState?.atTop ?? true;
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.band, page = widget.page, cafe = b.isCafe;
    return LayoutBuilder(
      builder: (_, c) => HallMenu(
        key: _menu, place: b.key, top: widget.top, height: c.maxHeight, progress: page.progress, band: page.rect, onBack: page.close, dragWrap: page.dragWrap,
        ghost: Band(
          ghost: true, compact: cafe, card: widget.card, name: b.name, status: b.status, parts: _parts,
          busy: b.lamps == null ? null : widget.card ? Meter(key: _parts.meter, lit: b.lamps!) : BusyRow(lamps: b.lamps!, word: b.word!, meterKey: _parts.meter),
          letter: cafe || widget.card ? null : HallLetter(key: _parts.letter, letter: b.key, x: hallLx[b.key]!),
        ),
        parts: _parts, seedStatus: b.status, seedBusy: b.lamps == null ? null : (lamps: b.lamps!, word: b.word!, extra: b.hasExtra),
      ),
    );
  }
}

/// A place's menu as a page of its own (no band to grow from): a launch route, or a push.
class HallMenuPage extends StatelessWidget {
  const HallMenuPage({super.key, required this.place, required this.top, this.day = 0, this.meal, this.dish, this.landOn});
  final String place;
  final double top;
  final int day;
  final String? meal;
  /// a dish's name: its sheet opens over the menu once the menu is in (the `dish` of a launch route)
  final String? dish;
  /// a dish's key: the menu arrives scrolled to it, the row tinted (where it's served)
  final String? landOn;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (_, c) => HallMenu(place: place, top: top, height: c.maxHeight, day: day, meal: meal, dish: dish, landOn: landOn, onBack: () => Navigator.of(context).maybePop(), onEvent: (i) => openEvent(context, i, top)),
      );
}
