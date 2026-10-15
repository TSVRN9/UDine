import 'package:flutter/widgets.dart';

import '../../motion/routes.dart';
import '../../ui/ui.dart';
import '../hall/hall_menu.dart';
import 'halls_model.dart';

/// The page a band opens into: the hall's menu (`HallMenu`) hung from the band's photo by the container transform, the band's own copy
/// fading out over it (CONCEPT "Motion vocabulary": 0 to .3), and Back. A café with dishes is the same page.
class HallPage extends StatefulWidget {
  const HallPage({super.key, required this.band, required this.page, required this.top});
  final BandVM band;
  final CardPage page;
  final double top;

  @override
  State<HallPage> createState() => _HallPageState();
}

class _HallPageState extends State<HallPage> {
  final _menu = GlobalKey<HallMenuState>();

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
          ghost: true, compact: cafe, name: b.name, status: b.status,
          busy: b.lamps == null ? null : BusyRow(lamps: b.lamps!, word: b.word!),
          letter: cafe ? null : HallLetter(letter: b.key, x: hallLx[b.key]!),
        ),
      ),
    );
  }
}

/// A place's menu as a page of its own (no band to grow from): a launch route, or a push.
class HallMenuPage extends StatelessWidget {
  const HallMenuPage({super.key, required this.place, required this.top, this.day = 0, this.meal});
  final String place;
  final double top;
  final int day;
  final String? meal;

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (_, c) => HallMenu(place: place, top: top, height: c.maxHeight, day: day, meal: meal, onBack: () => Navigator.of(context).maybePop()),
      );
}
