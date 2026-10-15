import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/types.dart' show diningHalls;
import '../../core/m2/places.dart';
import '../../core/m2/plate.dart';
import '../../shell/app_scope.dart';
import '../../shell/plate_model.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../dish/dish_sheet.dart';
import '../dish/full_label.dart';
import 'plate_bar.dart';
import 'plate_row.dart';

/// A Board that knows the places' names and the clock and nothing else: all the plate's labels and its dish sheets need from one.
Board plateBoard(DateTime clock) => Board(
  clock: clock,
  places: [
    for (var i = 0; i < halls.length; i++)
      Place(key: halls[i], name: diningHalls[i].name, area: -1),
    ...Roster.table.cafes,
  ],
  hours: const {},
  grab: const {},
  days: const {},
  events: const [],
);

/// The plate (M2 `#bar` + `#psheet`): the bar grown into a sheet. The bar is the sheet's pinned header and its lowest height; dragging
/// it up (or a tap) takes the sheet to its mid detent (the 36% line), more takes it to the top, a rubber band stops it there. The bar
/// slides in on the first add and out when the plate is gone and the receipt has timed out. Everything the plate does (Log, Undo, the
/// plates, the rows, Add something else, Full label, Clear plate) is here; the plate itself and the log are `PlateModel`'s.
class PlateSheet extends StatefulWidget {
  const PlateSheet({super.key});
  @override
  State<PlateSheet> createState() => _PlateSheetState();
}

class _PlateSheetState extends State<PlateSheet>
    with SingleTickerProviderStateMixin {
  final _handle = SheetHandle();
  final _px = ValueNotifier<double>(M2Layout.barMin);
  final _cal = GlobalKey();
  late final AppScope _scope = AppScope.of(context);
  late final AnimationController _in = AnimationController(
    vsync: this,
    value: _visible ? 1 : 0,
  );
  double _mid = M2Layout.barMin;
  bool _choose = false;

  PlateModel get _m => _scope.plate;
  bool get _visible =>
      _m.write != null &&
      (_m.state.plates.isNotEmpty || _m.receipt != null);
  Plate? get _front => _m.state.front < _m.state.plates.length
      ? _m.state.plates[_m.state.front]
      : null;

  @override
  void initState() {
    super.initState();
    _m.addListener(_onModel);
  }

  @override
  void dispose() {
    _m.removeListener(_onModel);
    _in.dispose();
    _px.dispose();
    super.dispose();
  }

  void _onModel() {
    if (!mounted) return;
    final p = _front;
    if (_choose && (p == null || (plateHalls(p)?.length ?? 0) < 2)) {
      _choose = false;
    }
    if (_visible && _in.value < 1 && _in.status != AnimationStatus.forward) {
      final a = resolveAnim(context, M2Motion.cont);
      _in.animateTo(1, duration: a.duration, curve: a.curve);
    } else if (!_visible &&
        _in.status != AnimationStatus.reverse &&
        _in.value > 0) {
      final a = resolveAnim(context, M2Motion.cont);
      _in.animateBack(0, duration: a.duration, curve: a.curve);
    }
    // M2 refresh(): no plate left, the sheet closes
    if (p == null && _handle.attached && _handle.px > M2Layout.barMin) {
      _handle.to(M2Layout.barMin);
    }
  }

  Future<void> _log({String? place}) async {
    final m = _m, p = _front;
    if (p == null || !m.canLog) return;
    final cal = totals(p, place).cal,
        box = _cal.currentContext?.findRenderObject() as RenderBox?;
    final from = box == null || !box.attached
        ? null
        : box.localToGlobal(box.size.center(Offset.zero));
    final shell = ShellScope.of(context), rm = reducedMotion(context);
    final ok = await m.log(place: place);
    if (!mounted) return;
    setState(() => _choose = false);
    if (!ok) return;
    Haptics.log();
    _handle.to(M2Layout.barMin);
    if (from != null && !rm) shell.toss(from: from, text: '+${fc(cal)}');
  }

  void _onLog() {
    final p = _front;
    if (p == null) return;
    if ((plateHalls(p)?.length ?? 0) > 1) {
      setState(() => _choose = true);
    } else {
      _log();
    }
  }

  void _undo() {
    Haptics.light();
    _m.undo();
  }

  void _open() {
    if (_m.receipt == null &&
        _handle.attached &&
        _handle.px <= M2Layout.barMin + 1) {
      _handle.to(_mid);
    }
  }

  void _openDish(Plate p, PlateItem it, Board fx) {
    if (it.custom != null) return;
    final place = plateHalls(p)?.firstOrNull ?? it.refs.keys.first,
        dish = it.refs[place] ?? it.refs.values.first;
    openDishSheet(
      context,
      dish: dish,
      place: place,
      meal: p.meal,
      day: 0,
      fx: fx,
      refs: it.refs,
      onServe: (to, g) => _handle.away(
        () => ShellScope.of(
          context,
        ).openPlace(to, meal: g.meal, day: g.day, dish: dish.key),
      ),
    );
  }

  void _fullLabel(Plate p, Board fx) =>
      openPlateLabel(context, plate: p, fx: fx);

  void _more() {
    final p = _front;
    _handle.to(M2Layout.barMin);
    ShellScope.of(context).openSearch(meal: p?.meal ?? 'lunch');
  }

  void _clear() {
    Haptics.remove();
    _m.clear();
    _handle.to(M2Layout.barMin);
  }

  Widget _body(Plate p, Board fx) {
    final hs = plateHalls(p),
        t = totals(p),
        m = _m,
        many = m.state.plates.length > 1;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        M2Space.gutter,
        M2Layout.plateBodyTop,
        M2Space.gutter,
        0,
      ),
      child: Arrive(
        key: ValueKey(p.id),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (many)
              Padding(
                padding: const EdgeInsets.only(
                  bottom: M2Layout.plateTabsBottom,
                ),
                child: Transform.translate(
                  offset: const Offset(M2Layout.plateTabsInset, 0),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (final (i, x) in m.state.plates.indexed) ...[
                          if (i > 0)
                            const SizedBox(width: M2Layout.plateTabGap),
                          _PlateTab(
                            label: plateLabel(fx, x),
                            on: i == m.state.front,
                            onTap: () {
                              Haptics.selection();
                              m.setFront(i);
                            },
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            for (final it in p.items)
              PlateRow(
                key: ValueKey('${p.id}/${it.key}'),
                item: it,
                cal: macroOf(it, hs?.firstOrNull).cal,
                onOpen: it.custom == null ? () => _openDish(p, it, fx) : null,
                onInc: () {
                  m.step(p.id, it.key, 1);
                  Haptics.add();
                },
                onDec: () {
                  m.step(p.id, it.key, -1);
                  Haptics.remove();
                },
              ),
            Padding(
              padding: const EdgeInsets.symmetric(
                vertical: M2Layout.factsMargin,
              ),
              child: Facts(
                cal: t.cal.toDouble(),
                p: t.p.toDouble(),
                c: t.c.toDouble(),
                f: t.f.toDouble(),
              ),
            ),
            CustomButton(
              label: 'Add something else',
              onTap: _more,
            ), // (`.sheet .custom` margin-top 10 collapses into the label's 16 above it)
            Padding(
              padding: const EdgeInsets.only(top: M2Layout.twobTop),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  TextAction('Full label', onTap: () => _fullLabel(p, fx)),
                  TextAction('Clear plate', onTap: _clear),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final st = safeTop(context), fx = plateBoard(_scope.repo.now());
    return ListenableBuilder(
      listenable: Listenable.merge([_m, _in]),
      builder: (context, _) {
        if (!_visible && _in.value == 0) return const SizedBox.shrink();
        final p = _front;
        return Transform.translate(
          offset: Offset(
            0,
            (1 - _in.value) * M2Layout.barMin * M2Layout.barHide,
          ),
          child: Stack(
            children: [
              M2Sheet(
                handle: _handle,
                top: st + M2Layout.sheetTop,
                min: M2Layout.barMin,
                startOpen: false,
                radius: 0,
                bottomPad: M2Layout.plateFoot + safeBottom(context),
                onSize: (v) => _px.value = v,
                mid: (m) {
                  final top = st + M2Layout.sheetTop;
                  // (M2's c: the plate's own height, the bar and 16; the 4 above the first row is not part of it)
                  final y = plateMidTop(
                    frameH: MediaQuery.sizeOf(context).height,
                    tabTop: m.height,
                    top: top,
                    content:
                        m.content -
                        M2Layout.plateBodyTop +
                        M2Layout.plateMidPad,
                    frac: M2Layout.midFrac,
                  );
                  return _mid = m.height - y;
                },
                header: PlateBar(
                  model: _m,
                  fx: fx,
                  choose: _choose,
                  calKey: _cal,
                  onLog: _onLog,
                  onLogAt: (h) => _log(place: h),
                  onUnchoose: () => setState(() => _choose = false),
                  onUndo: _undo,
                  onOpen: _open,
                ),
                slivers: [
                  if (p != null) SliverToBoxAdapter(child: _body(p, fx)),
                ],
              ),
              ValueListenableBuilder<double>(
                valueListenable: _px,
                builder: (_, px, _) => Positioned(
                  left: M2Layout.peekInset,
                  right: M2Layout.peekInset,
                  bottom: px,
                  height: M2Layout.peekH,
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: _m.state.plates.length > 1 && _m.receipt == null
                            ? M2Color.felt
                            : null,
                        borderRadius: const BorderRadius.vertical(
                          top: Radius.circular(M2Layout.peekRadius),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

/// `.ptabs button`: a plate's label, 44 tall, with the maroon underline on the front one.
class _PlateTab extends StatelessWidget {
  final String label;
  final bool on;
  final VoidCallback onTap;
  const _PlateTab({required this.label, required this.on, required this.onTap});
  @override
  Widget build(BuildContext context) => Press(
    scale: true,
    label: label,
    onTap: onTap,
    child: Container(
      height: M2Size.tap,
      padding: const EdgeInsets.symmetric(horizontal: M2Layout.plateTabPad),
      alignment: Alignment.center,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Text(
            label,
            style: M2Text.link.style(on ? M2Color.dm : M2Color.slate),
          ),
          if (on)
            Positioned(
              left: 0,
              right: 0,
              bottom: M2Layout.plateTabUnderBottom - M2Layout.plateTabUnder,
              height: M2Layout.plateTabUnder,
              child: const ColoredBox(color: M2Color.vm),
            ),
        ],
      ),
    ),
  );
}
