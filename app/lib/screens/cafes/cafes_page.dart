import 'package:flutter/widgets.dart';

import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'cafe_page.dart';
import 'cafes_model.dart';
import 'hours_feed.dart';

const _status = M2Type(15, null, 'LibreFranklin', FontWeight.w500), _statusOff = M2Type(15, null, 'LibreFranklin', FontWeight.w400);

/// Cafés & markets (M2 `pageContent('cafes')`): the maroon bar, the Open now chip (on, as M2 starts), then every area under a sticky
/// header, nearest area first, each place a row with its photo, building and status. `area` scrolls that area's header to the top, as
/// the Halls row it was pushed from names it. A row pushes the café's page.
class CafesPage extends StatefulWidget {
  const CafesPage({super.key, required this.top, this.area});
  final double top;
  final int? area;
  @override
  State<CafesPage> createState() => _CafesPageState();
}

class _CafesPageState extends State<CafesPage> {
  HoursFeed? _hours;
  bool _openNow = true;
  final _headKey = GlobalKey();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _hours ??= HoursFeed(AppScope.of(context).repo)..addListener(_onHours);
  }

  bool _scrolled = false;

  /// M2 `openPage`: opened on an area, the list starts with that area's header under the bar. The rows (and so the offset) are final
  /// once the hours are in, so that is when it scrolls.
  void _onHours() {
    if (_scrolled || widget.area == null || _hours!.data == null) return;
    _scrolled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _headKey.currentContext == null ? null : Scrollable.ensureVisible(_headKey.currentContext!));
  }

  @override
  void dispose() {
    _hours?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    return ColoredBox(
      color: M2Color.chalk,
      child: Column(children: [
        ScreenHeader.page(top: widget.top, title: 'Cafés & markets', onBack: () => Navigator.of(context).maybePop()),
        Expanded(
          child: ListenableBuilder(
            listenable: Listenable.merge([_hours!, scope.prefs]),
            builder: (context, _) {
              final vm = buildCafes(now: scope.repo.now(), state: _hours!.state, openNow: _openNow, charlesRiver: scope.prefs.charlesRiver, lastHall: scope.prefs.lastHall);
              return CustomScrollView(physics: const ClampingScrollPhysics(), slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.pbodyTop + M2Layout.chipsTop, M2Space.gutter, M2Layout.chipsBottom),
                  sliver: SliverToBoxAdapter(
                    child: Align(alignment: Alignment.centerLeft, child: FilterChipButton(label: 'Open now', selected: _openNow, onTap: () { Haptics.light(); setState(() => _openNow = !_openNow); })),
                  ),
                ),
                for (final a in vm.areas)
                  SliverMainAxisGroup(slivers: [
                    PinnedHeaderSliver(
                      child: Container(
                        key: a.area == widget.area ? _headKey : null,
                        color: M2Color.chalk, padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.areaHeadTop, M2Space.gutter, M2Layout.areaHeadBottom),
                        child: Semantics(header: true, child: Text(a.name, style: M2Text.section.style(M2Color.dm))),
                      ),
                    ),
                    SliverPadding(
                      padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
                      sliver: a.rows.isEmpty
                          ? SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.only(top: M2Layout.kvTop), child: Text('Nothing open here right now.', style: M2Text.sched.style(M2Color.slate))))
                          : SliverList.builder(
                              itemCount: a.rows.length,
                              itemBuilder: (_, i) => _row(context, a.rows[i], a == vm.areas.last && i == a.rows.length - 1),
                            ),
                    ),
                  ]),
                SliverToBoxAdapter(child: SizedBox(height: M2Layout.listFoot + safeBottom(context))),
              ]);
            },
          ),
        ),
      ]),
    );
  }

  Widget _row(BuildContext context, CafeRowVM r, bool last) {
    final p = r.place;
    return LRow(
      leading: Thumb(path: photoOf(p.key, p.name)),
      title: p.name, subtitle: p.building, last: last,
      trailing: r.status == null ? const SizedBox.shrink() : Text(r.status!, style: (r.open ? _status : _statusOff).style(r.open ? M2Color.vm : M2Color.slate)),
      onTap: () => Nav.push<void>(context, (_) => CafePage(cafeKey: p.key, top: widget.top)),
    );
  }
}
