import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../../core/content.dart';
import '../../core/m2/board.dart' show Place, clockMeal, mealLabel;
import '../../core/m2/places.dart';
import '../../core/m2/status.dart';
import '../../core/types.dart' show MealPeriod, MenuItem, RetailLocationHours;
import '../../data/repository.dart';
import '../../motion/container_math.dart';
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../../shell/prefs.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'cafes_model.dart';
import 'hours_feed.dart';

/// A café's page (M2 `#menu.cafe`): the hall page without the letter, the busy row and the board, and with a pin. The photo header
/// (its own colour, grade top and bottom), the name over the status line, Back and Pin over it; then the body, by what the café
/// has (`CafeBodyKind`). Opened from a pinned band it is a card (`page`); from a row it is a push.
/// ponytail: the header scrolls away under a maroon bar that fades in with the name (M2 travels the name into the bar and parallaxes
/// the photo), the status line is not yet the schedule's door, and a café with dishes has the placeholder body below;
/// `flutter-port-hall-menu` replaces all three with the hall page's own.
class CafePage extends StatefulWidget {
  const CafePage({super.key, required this.cafeKey, required this.top, this.page, this.pdfRows});
  /// `c<i>`
  final String cafeKey;
  final double top;
  final CardPage? page;
  /// `flutter-port-cafe-pdf`: the "Menus" rows of a café that lists PDFs. Without it the slot is empty and draws nothing.
  final Widget Function(BuildContext, RetailMenuPdf)? pdfRows;
  @override
  State<CafePage> createState() => _CafePageState();
}

class _CafePageState extends State<CafePage> {
  HoursFeed? _feed;
  final _scroll = ScrollController();
  StreamSubscription<DataState<CafeMenu>>? _sub;
  DataState<CafeMenu> _menu = Loading<CafeMenu>();
  String? _loaded;
  String? _meal;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_feed != null) return;
    _feed = HoursFeed(AppScope.of(context).repo)..addListener(_onHours);
    widget.page?.canDragDown = () => !_scroll.hasClients || _scroll.offset <= 0;
  }

  RetailLocationHours? _loc(HoursData d) {
    final title = straight(cafeTable[int.parse(widget.cafeKey.substring(1))].title);
    return d.feed.retail.where((r) => straight(r.name) == title).firstOrNull;
  }

  void _onHours() {
    final d = _feed!.data, loc = d == null ? null : _loc(d);
    if (loc != null && loc.name != _loaded) {
      _loaded = loc.name;
      _sub?.cancel();
      _sub = AppScope.of(context).repo.cafeMenu(loc, AppScope.of(context).repo.today).listen((s) => mounted ? setState(() => _menu = s) : null);
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _sub?.cancel();
    _feed?.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Place _place() {
    final d = _feed!.data;
    final table = Roster.table.cafes, from = d == null ? table : Roster.fromFeed(d.feed).cafes;
    return from.where((c) => c.key == widget.cafeKey).firstOrNull ?? table.firstWhere((c) => c.key == widget.cafeKey);
  }

  void _togglePin(AppPrefs prefs, String name) {
    final on = prefs.pins.contains(name);
    on ? Haptics.selection() : Haptics.light();
    prefs.setPins(on ? [for (final n in prefs.pins) if (n != name) n] : [...prefs.pins, name]);
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), top = widget.top, place = _place(), page = widget.page;
    final hours = _feed!.data?.feed == null ? null : Roster.fromFeed(_feed!.data!.feed).hours[widget.cafeKey];
    final status = hours == null ? null : statusText(hours, scope.repo.now());
    final head = headerHeight(top), photo = photoOf(place.key, place.name);
    final kind = switch (_menu) { Loaded(:final value) || LoadedOffline(:final value) => cafeBody(value), _ => null };
    return ColoredBox(
      color: M2Color.chalk,
      child: ListenableBuilder(
        listenable: scope.prefs,
        builder: (context, _) => Stack(children: [
          SingleChildScrollView(
            controller: _scroll,
            physics: const ClampingScrollPhysics(),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              SizedBox(
                height: head,
                child: Stack(children: [
                  const Positioned.fill(child: ColoredBox(color: M2Color.vm)),
                  if (photo != null) Positioned.fill(child: Photo(path: photo, pos: M2Layout.cafePhotoPos, duo: page == null ? const AlwaysStoppedAnimation(0.0) : ReverseAnimation(page.progress))),
                  Positioned(left: 0, right: 0, top: 0, height: top + M2Layout.topGradH, child: const _Grade(top: true)),
                  const Positioned(left: 0, right: 0, bottom: 0, height: M2Layout.bottomGradH, child: _Grade(top: false)),
                  Positioned(
                    left: M2Space.gutter, right: M2Space.gutter, bottom: M2Layout.titleBottomCafe,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                      _FitName(place.name),
                      if (status != null) Padding(padding: const EdgeInsets.only(top: M2Layout.statusUnderName, bottom: M2Layout.statusAboveBottom), child: Text(status, style: M2Text.status.style(M2Color.onDmSoft))),
                    ]),
                  ),
                ]),
              ),
              if (kind is DishesBody && kind.tabs) _MealTabs(meals: kind.meals, selected: _mealOf(kind, scope), onSelect: (m) => setState(() => _meal = m)),
              _body(context, place, kind, scope),
              SizedBox(height: M2Layout.listFoot + safeBottom(context)),
            ]),
          ),
          if (page != null)
            Positioned(
              left: 0, right: 0, top: page.rect.off, height: M2Layout.bandCompact,
              child: AnimatedBuilder(
                animation: page.progress,
                builder: (_, c) => Opacity(opacity: outgoingOpacity(page.progress.value), child: c),
                child: Band(ghost: true, compact: true, name: place.name, status: status),
              ),
            ),
          Positioned(
            left: 0, right: 0, top: 0, height: top + M2Layout.barH,
            child: IgnorePointer(
              child: AnimatedBuilder(
                animation: _scroll,
                builder: (_, c) {
                  final p = ((_scroll.hasClients ? _scroll.offset : 0) / (head - top - M2Layout.barH));
                  return Opacity(opacity: ((p - M2Collapse.solidStart) / M2Collapse.solidSpan).clamp(0.0, 1.0), child: c);
                },
                child: Container(
                  color: M2Color.vm, padding: EdgeInsets.only(top: top, left: M2Layout.backLeft + M2Layout.backBtn + M2Layout.pageTitleGap, right: M2Layout.backBtn + M2Layout.backLeft),
                  alignment: Alignment.centerLeft,
                  child: Text(place.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: M2Text.section.style(M2Color.white)),
                ),
              ),
            ),
          ),
          Positioned(
            left: 0, right: 0, top: top, height: M2Layout.barH,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: M2Layout.backLeft),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                BackButton(onTap: page?.close ?? () => Navigator.of(context).maybePop()),
                PinButton(pinned: scope.prefs.pins.contains(place.name), onTap: () => _togglePin(scope.prefs, place.name)),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  String _mealOf(DishesBody b, AppScope scope) {
    final m = _meal, cm = clockMeal(scope.repo.now());
    final keys = [for (final p in b.meals) mealKeyOf[p]!];
    return m != null && keys.contains(m) ? m : keys.contains(cm) ? cm : keys.contains('all') ? 'all' : keys.first;
  }

  Widget _body(BuildContext context, Place place, CafeBodyKind? kind, AppScope scope) {
    final feedState = _feed!.state;
    if (kind == null) {
      final failed = feedState is Failed<HoursData> || feedState is NotSaved<HoursData> || _menu is Failed<CafeMenu> || _menu is NotSaved<CafeMenu>;
      if (!failed) return const SizedBox(height: M2Size.mstate, child: Center(child: Spinner()));
      return Padding(
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Space.stateTop, M2Space.gutter, M2Layout.stateBottom),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text("${place.name}'s menu didn't load.", style: M2Text.empty.style(M2Color.slate)),
          const SizedBox(height: M2Space.stateGap),
          Button(kind: ButtonKind.line, label: 'Try again', onTap: () { Haptics.light(); _loaded = null; _feed!.load(); }),
        ]),
      );
    }
    if (kind is DishesBody) return DishesPlaceholder(key: const Key('hall-menu-body'), items: _items(kind, scope));
    return _CafeBody(kind: kind, place: place, pdfRows: widget.pdfRows);
  }

  List<MenuItem> _items(DishesBody kind, AppScope scope) {
    final m = _mealOf(kind, scope);
    final s = _menu;
    final items = switch (s) { Loaded(:final value) || LoadedOffline(:final value) => value is IntegratedCafeMenu ? value.items : const <MenuItem>[], _ => const <MenuItem>[] };
    return [for (final i in items) if (mealKeyOf[i.mealPeriod] == m) i];
  }
}

class _Grade extends StatelessWidget {
  final bool top;
  const _Grade({required this.top});
  @override
  Widget build(BuildContext context) {
    final g = top ? M2Gradient.headTop : M2Gradient.headBottom;
    return IgnorePointer(
      child: DecoratedBox(
        decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: g.colors, stops: g.stops)),
        child: const SizedBox.expand(),
      ),
    );
  }
}

/// M2 `fitName`: the name at 40, set smaller to fit one line (never below 26).
class _FitName extends StatelessWidget {
  final String name;
  const _FitName(this.name);
  @override
  Widget build(BuildContext context) => LayoutBuilder(builder: (_, c) {
        final full = TextPainter(text: TextSpan(text: name, style: M2Text.menuName.style(M2Color.white)), textDirection: TextDirection.ltr)..layout();
        final max = c.maxWidth, w = full.width;
        final size = w <= max ? M2Text.menuName.size : math.max(M2Layout.nameMinFit, (M2Text.menuName.size * max / w).floorToDouble());
        return Semantics(header: true, child: Text(name, maxLines: 1, softWrap: false, overflow: TextOverflow.ellipsis, style: M2Text.menuName.withSize(size).style(M2Color.white)));
      });
}

/// The meal row of a café with more than one (`#mtabs`): 48 dp on dark maroon, labels at 14 sharing the width, the selected one white
/// and bold under a gold rule. A café with one meal has none.
class _MealTabs extends StatelessWidget {
  final List<MealPeriod> meals;
  final String selected;
  final ValueChanged<String> onSelect;
  const _MealTabs({required this.meals, required this.selected, required this.onSelect});
  @override
  Widget build(BuildContext context) => Container(
        height: M2Size.tabs, color: M2Color.dm, padding: const EdgeInsets.symmetric(horizontal: M2Layout.tabsPadX),
        child: Row(children: [
          for (final p in meals)
            Expanded(
              child: Press(
                onTap: () { Haptics.selection(); onSelect(mealKeyOf[p]!); },
                label: mealLabel[mealKeyOf[p]!]!,
                child: Stack(alignment: Alignment.center, children: [
                  ExcludeSemantics(child: Text(mealLabel[mealKeyOf[p]!]!, maxLines: 1, style: M2Text.mealTab.style(mealKeyOf[p] == selected ? M2Color.white : M2Color.onDm).copyWith(fontWeight: mealKeyOf[p] == selected ? FontWeight.w600 : null))),
                  if (mealKeyOf[p] == selected) Positioned(left: M2Layout.underInset, right: M2Layout.underInset, bottom: 0, height: M2Layout.underH, child: const ColoredBox(color: M2Color.gold)),
                ]),
              ),
            ),
        ]),
      );
}

/// The body of a café with dishes, until `flutter-port-hall-menu` swaps in the hall's own: the meal's dish names, no controls.
class DishesPlaceholder extends StatelessWidget {
  final List<MenuItem> items;
  const DishesPlaceholder({super.key, required this.items});
  @override
  Widget build(BuildContext context) => Column(children: [
        for (final d in items) ListRow(name: TextSpan(text: d.dishName), label: d.dishName),
      ]);
}

/// `.cbody`: a café without a dish menu. Description, then Menu (a names list, or what it doesn't list), then Add a custom food; a café
/// of PDFs puts the "Menus" rows first and the description last (R11 §3).
class _CafeBody extends StatelessWidget {
  final CafeBodyKind kind;
  final Place place;
  final Widget Function(BuildContext, RetailMenuPdf)? pdfRows;
  const _CafeBody({required this.kind, required this.place, this.pdfRows});

  @override
  Widget build(BuildContext context) {
    final pdf = kind is PdfBody;
    Widget desc(double top) => place.description.isEmpty ? const SizedBox.shrink() : Padding(padding: EdgeInsets.only(top: top), child: Text(place.description, style: M2Text.desc.style(M2Color.ink)));
    Widget h3(String t, double top) => Padding(padding: EdgeInsets.only(top: top, bottom: M2Layout.h3Bottom), child: Semantics(header: true, child: Text(t, style: M2Text.section.style(M2Color.dm))));
    return Padding(
      padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Space.cafeBodyTop, M2Space.gutter, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (!pdf) desc(0),
        switch (kind) {
          PdfBody(:final pdf) => pdfRows == null ? const SizedBox.shrink() : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [h3('Menus', M2Layout.h3Bottom), pdfRows!(context, pdf)]),
          NamesBody(:final items) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              h3('Menu', M2Layout.h3Gap),
              for (final i in items)
                Container(
                  constraints: const BoxConstraints(minHeight: M2Layout.namesRowMin),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
                  alignment: Alignment.centerLeft,
                  child: Row(children: [
                    Expanded(child: Text(i.name, style: M2Text.rowName.style(M2Color.ink))),
                    if (i.price != null) Text(i.price!, style: M2Text.meta.style(M2Color.slate)),
                  ]),
                ),
            ]),
          _ => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              h3('Menu', M2Layout.h3Gap),
              Padding(padding: const EdgeInsets.symmetric(vertical: M2Space.kvTop), child: Text("${place.name} doesn't list its menu in the app.", style: M2Text.sched.style(M2Color.slate))),
            ]),
        },
        Padding(padding: EdgeInsets.only(top: kind is NamesBody ? M2Space.group : pdf ? M2Space.eventBottom : 0), child: const Button(kind: ButtonKind.primary, label: 'Add a custom food', expand: true)),
        if (pdf) desc(M2Space.group),
      ]),
    );
  }
}
