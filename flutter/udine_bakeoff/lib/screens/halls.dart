import 'package:flutter/widgets.dart';
import '../logic/busy.dart';
import '../logic/fixture.dart';
import '../logic/hours.dart';
import '../logic/status.dart';
import '../logic/net.dart';
import '../motion/container_math.dart';
import '../motion/container_transform.dart';
import '../state/net.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';
import 'hall_menu.dart';

/// The pinned cafés on Halls; pinning UI is out of scope for the bake-off.
const defaultPins = ['Wasabi', 'Tamales'];

const _weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const _months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

class _HallsListState extends State<HallsList> with SingleTickerProviderStateMixin {
  final _scroll = ScrollController();
  // M2 `fillBands(true)`: what arrives late (hours after a slow load or a retry, busy) fades in over `settle`; at boot it is simply there
  late final _arrive = AnimationController(vsync: this, value: 1, duration: M2Motion.settle.duration);
  Net? _net;
  late final Net _ok = Net(widget.fx);
  bool? _hk, _lk;

  Net get net => _net ?? _ok;

  @override
  void initState() {
    super.initState();
    // decode every hall's photo while Halls is idle, so the first hall to open does not decode it in its opening frames
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !Photos.enabled) return;
      for (final k in [...halls, ...widget.pins.map((n) => widget.fx.places.firstWhere((p) => p.name == n).key)]) {
        final path = photoOf(k, widget.fx.places.firstWhere((p) => p.key == k).name);
        if (path != null) precacheImage(AssetImage(path), context);
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final n = NetScope.maybeOf(context) ?? _ok;
    if (n != _net) {
      _net?.removeListener(_onNet);
      _net = n..addListener(_onNet);
      _hk = n.hoursKnown;
      _lk = n.liveKnown;
    }
  }

  void _onNet() {
    final n = net, late = (n.hoursKnown && _hk == false) || (n.liveKnown && _lk == false);
    _hk = n.hoursKnown;
    _lk = n.liveKnown;
    if (late && mounted) {
      final a = reducedMotion(context) ? M2Motion.rmFade : M2Motion.settle;
      _arrive.value = 0;
      _arrive.duration = a.duration;
      _arrive.animateTo(1, curve: a.curve);
    }
  }
  final _keys = <String, GlobalKey>{};

  @override
  void dispose() {
    _net?.removeListener(_onNet);
    _arrive.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Widget _cell(String key, DateTime now) {
    final fx = widget.fx;
    final p = fx.places.firstWhere((q) => q.key == key);
    final compact = isCafe(key);
    final path = photoOf(key, p.name);
    final hh = headerHeight(widget.top), off = bandOff(key, widget.top);
    final busy = compact || !net.liveKnown ? null : busyView(fx.busy[key]!);
    return Opacity(
      key: _keys.putIfAbsent(key, GlobalKey.new),
      opacity: widget.hidden == key ? 0 : 1,
      child: Band(
        name: p.name, compact: compact, status: net.hoursKnown ? statusText(fx.hours[key]!, now) : null, fade: _arrive,
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
    final brand = Text('UDine', style: M2Text.brand.normal().style(M2Color.gold));
    final dateText = Text(date, style: M2Text.date.style(M2Color.onDm));
    return ColoredBox(
      color: M2Color.chalk,
      child: Stack(children: [
        SingleChildScrollView(
          controller: _scroll,
          physics: const ClampingScrollPhysics(),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Stack(children: [
            Container(
              color: M2Color.dm,
              padding: EdgeInsets.fromLTRB(M2Space.gutter, top + M2Layout.headerPadTop, M2Space.gutter, M2Layout.headPadBottom),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                SizedBox(height: M2Layout.brandRowH, child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [brand, dateText])),
                Padding(padding: const EdgeInsets.only(top: M2Layout.titleGap), child: Semantics(header: true, child: Text(mealLabel[clockMeal(DateTime.parse(fx.clock))]!, style: M2Text.hallTitle.style(M2Color.white)))),
              ]),
            ),
            // the date line keeps the date and adds what the network did
            if (net.mode == NetMode.offline || net.mode == NetMode.fail)
              Positioned(
                right: M2Space.gutter, top: top + M2Layout.netTop,
                child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Text(net.mode == NetMode.offline ? "You're offline" : "Couldn't connect", style: M2Text.date.normal().style(M2Color.onDm)),
                  if (net.mode == NetMode.fail)
                    Padding(padding: const EdgeInsets.only(top: M2Layout.netGap), child: Button(kind: ButtonKind.outline, label: 'Try again', onTap: () { Haptics.light(); net.retry(); })),
                ]),
              ),
            ]),
            ColoredBox(color: M2Color.dm, child: Column(children: [for (final k in places.where((k) => !isCafe(k))) _cell(k, now)])),
            if (places.any(isCafe)) ColoredBox(color: M2Color.dm, child: Column(children: [for (final k in places.where(isCafe)) _cell(k, now)])),
            Padding(
              padding: EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.secTop, M2Space.gutter, M2Layout.listFoot + safeBottom(context)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(padding: EdgeInsets.only(bottom: M2Layout.secTitleGap), child: Text('Cafés & markets', style: M2Text.section.style(M2Color.dm))),
                for (var i = 0; i < M2Layout.areaCount; i++)
                  Container(
                    constraints: const BoxConstraints(minHeight: M2Layout.areaRowMin),
                    padding: EdgeInsets.symmetric(vertical: M2Space.part),
                    decoration: BoxDecoration(border: i < M2Layout.areaCount - 1 ? Border(bottom: BorderSide(color: M2Color.hair)) : null),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(fx.areas[i], style: M2Text.rowName.style(M2Color.ink)),
                        Padding(
                          padding: const EdgeInsets.only(top: M2Layout.areaMetaGap),
                          child: !net.hoursKnown ? const SizedBox.shrink() : Builder(builder: (_) {
                            final ps = fx.places.where((p) => p.area == i).toList();
                            final open = ps.where((p) => isOpenNow(fx.hours[p.key]!, now)).length;
                            return FadeTransition(opacity: _arrive, child: Text('$open of ${ps.length} open now', style: M2Text.meta.style(M2Color.slate)));
                          }),
                        ),
                      ])),
                      const Chevron(),
                    ]),
                  ),
              ]),
            ),
          ]),
        ),
        Positioned(
          left: 0, right: 0, top: 0, height: top + M2Layout.collapsedBar,
          child: IgnorePointer(
            child: AnimatedBuilder(
              animation: _scroll,
              builder: (_, c) => Opacity(opacity: (((_scroll.hasClients ? _scroll.offset : 0) - M2Layout.collapseStart) / M2Layout.collapseSpan).clamp(0.0, 1.0), child: c),
              child: Container(
                color: M2Color.dm,
                padding: EdgeInsets.fromLTRB(M2Space.gutter, top, M2Space.gutter, 0),
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

  final _menu = GlobalKey<HallMenuState>();

  /// The interactive back (drag down from the top of the list, or in from the left edge) around `child`.
  Widget _back(Widget child) => RawGestureDetector(
        behavior: HitTestBehavior.opaque,
        gestures: {
          BackSwipeRecognizer: GestureRecognizerFactoryWithHandlers<BackSwipeRecognizer>(
            // a drag down only takes the screen while its list is at the top (M2: `sc.scrollTop <= 0`)
            () => BackSwipeRecognizer(onGrab: t.grab, onMove: t.move, onRelease: t.release, canDragDown: () => _menu.currentState?.atTop ?? true),
            (_) {},
          ),
        },
        child: child,
      );

  /// Hardware back: closes the open hall (true), or says there is none.
  bool closeHall() {
    if (!t.machine.mounted) return false;
    t.close();
    return true;
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(builder: (_, c) {
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
            child: _back(
              ContainerWindow(
                t: t, height: h,
                child: HallMenu(
                  key: _menu, fx: widget.fx, place: _place!, top: widget.top, height: h, progress: t.progress, band: t.rect, bandOpen: t.phase == Phase.open, onBack: t.close,
                  dragWrap: _back,
                ),
              ),
            ),
          ),
        ],
      ]);
    });
  }
}
