import 'package:flutter/widgets.dart';
import '../logic/busy.dart';
import '../logic/fixture.dart';
import '../logic/hours.dart';
import '../logic/status.dart';
import '../motion/container_math.dart';
import '../motion/container_transform.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';
import 'hall_page.dart';

/// The pinned cafés on Halls; pinning UI is out of scope for the bake-off.
const defaultPins = ['Wasabi', 'Tamales'];

const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

class _Chevron extends CustomPainter {
  const _Chevron();
  @override
  void paint(Canvas canvas, Size s) {
    canvas.scale(s.width / 24);
    canvas.drawPath(Path()..moveTo(9, 6)..relativeLineTo(6, 6)..relativeLineTo(-6, 6),
        Paint()..color = M2Color.slate..style = PaintingStyle.stroke..strokeWidth = 2.2..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round);
  }

  @override
  bool shouldRepaint(_Chevron old) => false;
}

/// Halls: the header, the rack of photo bands (four halls, then the pinned cafés), then the chalk list of areas. The header
/// collapses into the maroon bar on scroll.
class HallsList extends StatefulWidget {
  final Fixture fx;
  final List<String> pins;
  final double top;
  /// the band that is the open screen: it is not drawn (it is the container)
  final String? hidden;
  final void Function(String key, Rect band) onOpen;
  const HallsList({super.key, required this.fx, required this.pins, required this.top, required this.hidden, required this.onOpen});
  @override
  State<HallsList> createState() => _HallsListState();
}

class _HallsListState extends State<HallsList> {
  final _scroll = ScrollController();
  final _keys = <String, GlobalKey>{};

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  Widget _cell(String key, DateTime now) {
    final fx = widget.fx;
    final p = fx.places.firstWhere((q) => q.key == key);
    final compact = isCafe(key);
    final path = photoOf(key, p.name);
    final hh = headerHeight(widget.top), off = bandOff(key, widget.top);
    final busy = compact ? null : busyView(fx.busy[key]!);
    return Opacity(
      key: _keys.putIfAbsent(key, GlobalKey.new),
      opacity: widget.hidden == key ? 0 : 1,
      child: Band(
        name: p.name, compact: compact, status: statusText(fx.hours[key]!, now),
        busy: busy == null ? null : BusyRow(lamps: busy.lamps, word: busy.word),
        photo: path == null ? null : Positioned(left: 0, right: 0, top: -off, height: hh, child: Photo(path: path, pos: compact ? 0.5 : photoPos[key]!)),
        letter: compact ? null : HallLetter(letter: key, x: hallLx[key]!),
        onTap: () {
          final box = _keys[key]!.currentContext!.findRenderObject()! as RenderBox;
          final o = box.localToGlobal(Offset.zero);
          widget.onOpen(key, Rect.fromLTWH(o.dx, o.dy + 1, box.size.width, box.size.height - 1)); // the 1 px seam above the band is not the band
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final fx = widget.fx, top = widget.top;
    final now = toEastern(DateTime.parse(fx.clock));
    final date = '${_weekdays[now.weekday - 1]}, ${_months[now.month - 1]} ${now.day}';
    final places = [...halls, for (final n in widget.pins) fx.places.firstWhere((p) => p.name == n).key];
    final brand = Text('UDine', style: M2Text.brand.style(M2Color.gold));
    final dateText = Text(date, style: M2Text.date.style(M2Color.onDm));
    return ColoredBox(
      color: M2Color.chalk,
      child: Stack(children: [
        SingleChildScrollView(
          controller: _scroll,
          physics: const ClampingScrollPhysics(),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Container(
              color: M2Color.dm,
              padding: EdgeInsets.fromLTRB(M2Space.s[4], top + 10, M2Space.s[4], M2Space.s[3]),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(height: 30, child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [brand, dateText])),
                Padding(padding: const EdgeInsets.only(top: 2), child: Semantics(header: true, child: Text(mealLabel[clockMeal(DateTime.parse(fx.clock))]!, style: M2Text.hallTitle.style(M2Color.white)))),
              ]),
            ),
            ColoredBox(color: M2Color.dm, child: Column(children: [for (final k in places.where((k) => !isCafe(k))) _cell(k, now)])),
            if (places.any(isCafe)) ColoredBox(color: M2Color.dm, child: Column(children: [for (final k in places.where(isCafe)) _cell(k, now)])),
            Padding(
              padding: EdgeInsets.fromLTRB(M2Space.s[4], M2Space.s[3] + 10, M2Space.s[4], 120),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(padding: EdgeInsets.only(bottom: M2Space.s[0]), child: Text('Cafés & markets', style: M2Text.section.style(M2Color.dm))),
                for (var i = 0; i < 4; i++)
                  Container(
                    constraints: const BoxConstraints(minHeight: 56),
                    padding: EdgeInsets.symmetric(vertical: M2Space.s[1]),
                    decoration: BoxDecoration(border: i < 3 ? Border(bottom: BorderSide(color: M2Color.hair)) : null),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(fx.areas[i], style: M2Text.rowName.style(M2Color.ink)),
                        Padding(
                          padding: const EdgeInsets.only(top: 2),
                          child: Builder(builder: (_) {
                            final ps = fx.places.where((p) => p.area == i).toList();
                            final open = ps.where((p) => isOpenNow(fx.hours[p.key]!, now)).length;
                            return Text('$open of ${ps.length} open now', style: M2Text.meta.style(M2Color.slate));
                          }),
                        ),
                      ])),
                      const CustomPaint(size: Size(18, 18), painter: _Chevron()),
                    ]),
                  ),
              ]),
            ),
          ]),
        ),
        Positioned(
          left: 0, right: 0, top: 0, height: top + 44,
          child: IgnorePointer(
            child: AnimatedBuilder(
              animation: _scroll,
              builder: (_, c) => Opacity(opacity: (((_scroll.hasClients ? _scroll.offset : 0) - 40) / 24).clamp(0.0, 1.0), child: c),
              child: Container(
                color: M2Color.dm,
                padding: EdgeInsets.fromLTRB(M2Space.s[4], top, M2Space.s[4], 0),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.center, children: [brand, dateText]),
              ),
            ),
          ),
        ),
      ]),
    );
  }
}

/// The Halls tab: the list, and over it the container transform (scrim, then the window holding the hall). `HallsList` holds the
/// band that is open back (hidden) from the moment of the tap until a finished close.
class HallsTab extends StatefulWidget {
  final Fixture fx;
  final List<String> pins;
  final double top;
  const HallsTab({super.key, required this.fx, this.pins = defaultPins, this.top = 0});
  @override
  State<HallsTab> createState() => HallsTabState();
}

class HallsTabState extends State<HallsTab> with SingleTickerProviderStateMixin {
  late final t = ContainerTransform(vsync: this);
  String? _place;

  @override
  void initState() {
    super.initState();
    t.addListener(_changed);
  }

  void _changed() => setState(() {
        if (t.phase == Phase.closed) _place = null;
      });

  @override
  void dispose() {
    t.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: !t.machine.mounted,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) t.close();
      },
      child: LayoutBuilder(builder: (_, c) {
        final h = c.maxHeight;
        return Stack(children: [
          Positioned.fill(
            child: HallsList(
              fx: widget.fx, pins: widget.pins, top: widget.top, hidden: _place,
              onOpen: (key, band) {
                final origin = (context.findRenderObject()! as RenderBox).localToGlobal(Offset.zero);
                _place = key;
                t.open(BandRect(band.top - origin.dy, band.height, bandOff(key, widget.top)));
              },
            ),
          ),
          if (t.machine.mounted && _place != null) ...[
            Positioned.fill(
              child: IgnorePointer(
                child: AnimatedBuilder(
                  animation: t.progress,
                  builder: (_, _) => ColoredBox(color: M2Color.scrim.withValues(alpha: M2Motion.scrim * t.progress.value)),
                ),
              ),
            ),
            Positioned.fill(
              child: RawGestureDetector(
                behavior: HitTestBehavior.opaque,
                gestures: {
                  BackSwipeRecognizer: GestureRecognizerFactoryWithHandlers<BackSwipeRecognizer>(
                    () => BackSwipeRecognizer(onGrab: t.grab, onMove: t.move, onRelease: t.release),
                    (_) {},
                  ),
                },
                child: ContainerWindow(t: t, height: h, child: HallPage(t: t, fx: widget.fx, place: _place!, height: h, top: widget.top)),
              ),
            ),
          ],
        ]);
      }),
    );
  }
}
