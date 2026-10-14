import 'package:flutter/widgets.dart';

import '../../core/m2/board.dart' show halls;
import '../../core/m2/places.dart' show cafeKey, cafeTable;
import '../../data/repository.dart' show HoursData, Loaded, LoadedOffline;
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'hall_page.dart';
import 'halls_controller.dart';
import 'halls_model.dart';

/// Halls: the date line and the meal, the rack of bands (four halls, then the pinned cafés), then the chalk list of areas. The
/// header collapses into the maroon bar on scroll. Tapping a band opens its page by the container transform; an area row pushes.
class HallsScreen extends StatefulWidget {
  const HallsScreen({super.key, required this.top});
  final double top;
  @override
  State<HallsScreen> createState() => _HallsScreenState();
}

class _HallsScreenState extends State<HallsScreen> with SingleTickerProviderStateMixin {
  final _scroll = ScrollController();
  // M2 `fillBands(true)`: what arrives late (hours after a slow load or a retry, busy) fades in over `settle`; what was cached is simply there
  late final _arrive = AnimationController(vsync: this, value: 1);
  final _keys = <String, GlobalKey>{};
  HallsController? _c;
  bool _hk = false, _lk = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // decode the photos while Halls is idle, so the first page to open does not decode its own in its opening frames
    if (_c == null && Photos.enabled) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final scope = AppScope.of(context);
        for (final k in [...halls, for (final n in scope.prefs.pins) ?cafeKey(n)]) {
          final path = photoOf(k, k.startsWith('c') ? cafeTable[int.parse(k.substring(1))].name : '');
          if (path != null) precacheImage(AssetImage(path), context);
        }
      });
    }
    _c ??= HallsController(AppScope.of(context).repo)..addListener(_onData);
  }

  bool get _hoursIn => _c!.state is Loaded<HoursData> || _c!.state is LoadedOffline<HoursData>;
  bool get _liveIn => _c!.reads.isNotEmpty;

  void _onData() {
    final hk = _hoursIn, lk = _liveIn;
    if (((hk && !_hk && _c!.sawLoading) || (lk && !_lk)) && mounted) {
      final a = resolveAnim(context, M2Motion.settle);
      _arrive.value = 0;
      _arrive.animateTo(1, duration: a.duration, curve: a.curve);
    }
    _hk = hk;
    _lk = lk;
  }

  @override
  void dispose() {
    _c?.removeListener(_onData);
    _c?.dispose();
    _arrive.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _open(BandVM b) {
    final scope = AppScope.of(context);
    final box = _keys[b.key]!.currentContext!.findRenderObject()! as RenderBox;
    final o = box.localToGlobal(Offset.zero);
    Nav.openCard<void>(
      context, source: b.key, hider: scope.hider, off: bandOff(b.key, widget.top),
      band: Rect.fromLTWH(o.dx, o.dy + M2Layout.seam, box.size.width, box.size.height - M2Layout.seam), // the seam above a band is not the band
      builder: (_, page) => HallPage(band: b, page: page, top: widget.top),
    );
  }

  /// The band's window into its page's header photo (M2 `.win`): the photo at header size, offset so the pixels line up when it opens.
  Widget? _photo(BandVM b) {
    final path = photoOf(b.key, b.name);
    if (path == null) return null;
    return Positioned(left: 0, right: 0, top: -bandOff(b.key, widget.top), height: headerHeight(widget.top), child: Photo(path: path, pos: b.isCafe ? M2Layout.cafePhotoPos : photoPos[b.key]!));
  }

  Widget _band(BandVM b, HallsVM vm) {
    final hider = AppScope.of(context).hider;
    final cafe = b.isCafe;
    return ListenableBuilder(
      key: _keys.putIfAbsent(b.key, GlobalKey.new),
      listenable: hider,
      builder: (_, _) => Opacity(
        opacity: hider.hides(b.key) ? 0 : 1,
        child: Band(
          name: b.name, compact: cafe, status: b.status, fade: _arrive,
          photo: _photo(b),
          busy: b.lamps == null ? null : BusyRow(lamps: b.lamps!, word: b.word!),
          letter: cafe ? null : HallLetter(letter: b.key, x: hallLx[b.key]!),
          onTap: () => _open(b),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), top = widget.top;
    return ColoredBox(
      color: M2Color.chalk,
      child: ListenableBuilder(
        listenable: Listenable.merge([_c!, scope.prefs]),
        builder: (context, _) {
          final vm = buildHalls(now: scope.repo.now(), state: _c!.state, reads: _c!.reads, pins: scope.prefs.pins, charlesRiver: scope.prefs.charlesRiver);
          final brand = Text('UDine', style: M2Text.brand.normal().style(M2Color.gold));
          final dateText = Text(vm.date, style: M2Text.date.style(M2Color.onDm));
          return Stack(children: [
            SingleChildScrollView(
              controller: _scroll,
              physics: const ClampingScrollPhysics(),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Stack(children: [
                  ScreenHeader.title(top: top, title: vm.title, date: vm.date, mark: 'UDine'),
                  // the date line keeps the date and adds what the network did
                  if (vm.line != NetLine.none)
                    Positioned(
                      right: M2Space.gutter, top: top + M2Layout.netTop,
                      child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                        Text(vm.line == NetLine.offline ? "You're offline" : "Couldn't connect", style: M2Text.date.normal().style(M2Color.onDm)),
                        if (vm.retry)
                          Padding(
                            padding: const EdgeInsets.only(top: M2Layout.netGap),
                            child: Button(kind: ButtonKind.outline, label: 'Try again', onTap: () { Haptics.light(); _c!.load(); }),
                          ),
                      ]),
                    ),
                ]),
                ColoredBox(color: M2Color.dm, child: Column(children: [for (final b in vm.halls) _band(b, vm)])),
                if (vm.pins.isNotEmpty) ColoredBox(color: M2Color.dm, child: Column(children: [for (final b in vm.pins) _band(b, vm)])),
                Padding(
                  padding: EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.secTop, M2Space.gutter, M2Layout.listFoot + safeBottom(context)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Padding(padding: const EdgeInsets.only(bottom: M2Layout.secTitleGap), child: Text('Cafés & markets', style: M2Text.section.style(M2Color.dm))),
                    for (var i = 0; i < vm.areas.length; i++)
                      LRow(
                        title: vm.areas[i].name, subtitle: vm.areas[i].count, fade: _arrive, last: i == vm.areas.length - 1,
                        onTap: () => Nav.push<void>(context, (_) => AreaPage(title: vm.areas[i].name, top: top)),
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
          ]);
        },
      ),
    );
  }
}
