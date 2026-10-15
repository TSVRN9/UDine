import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/m2/schedule.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// M2's schedule (round 9; `schedHTML`): the place's address and Directions, then the fifteen days in date order, the chosen one open
/// in place with each meal's window (or the holiday's hours event). A day row picks that day. It opens already scrolled so the chosen
/// day and its hours are on screen at rest: the offset is worked out from the laid-out rows before the sheet is visible, so nothing
/// scrolls after it is drawn. `schedule` is read again whenever `data` changes (the days' menus land while it is open).
class ScheduleSheet extends StatefulWidget {
  final SheetHandle handle;
  final double top;
  final Listenable data;
  final Schedule Function() schedule;
  final ValueChanged<int> onPick;
  /// a holiday's row opens its event (an index into the events)
  final ValueChanged<int> onEvent;
  final VoidCallback onClosed;
  const ScheduleSheet({super.key, required this.handle, required this.top, required this.data, required this.schedule, required this.onPick, required this.onEvent, required this.onClosed});
  @override
  State<ScheduleSheet> createState() => _ScheduleSheetState();
}

class _ScheduleSheetState extends State<ScheduleSheet> {
  final _body = GlobalKey(), _end = GlobalKey();

  double? _landing(SheetMetrics m, double mid) {
    final body = _body.currentContext?.findRenderObject() as RenderBox?, end = _end.currentContext?.findRenderObject() as RenderBox?;
    if (body == null || end == null) return null;
    final bottom = end.localToGlobal(Offset(0, end.size.height), ancestor: body).dy + M2Layout.landingSlack;
    final visible = mid - M2Layout.grabH; // the sheet's resting height under its pinned grab
    return bottom > visible ? bottom - visible : null;
  }

  // ponytail: a phone with no maps app opens nothing; there is nothing else to offer.
  void _directions(String mapAddress) => launchUrl(mapsUri(mapAddress), mode: LaunchMode.externalApplication).catchError((_) => false);

  Widget _day(SchedDay d) {
    final open = d.current && (d.meals.isNotEmpty || d.event != null);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      SheetOption(label: d.label, trailing: d.right, trailingStyle: SheetTrailing.note, current: d.current, onTap: () => widget.onPick(d.i)),
      if (open)
        NegMargin(
          top: M2Layout.mwsTop,
          child: Container(
            key: _end,
            padding: const EdgeInsets.fromLTRB(M2Layout.mwsPadLeft, 0, M2Space.gutter, M2Layout.mwsPadBottom),
            decoration: const BoxDecoration(border: Border(left: BorderSide(width: M2Layout.optionEdge, color: M2Color.vm))),
            child: d.event != null
                ? Press(
                    overlay: M2Color.pressRow, label: d.event!.title, onTap: () => widget.onEvent(d.event!.index),
                    child: SizedBox(height: M2Layout.evRowH, child: Row(children: [Expanded(child: Text(d.event!.title, style: M2Text.link.style(M2Color.dm))), const Chevron()])),
                  )
                : Column(children: [
                    for (final m in d.meals)
                      SizedBox(
                        height: M2Layout.mwRowH,
                        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          Text(m.label, style: M2Text.sched.style(M2Color.ink)),
                          Text(m.window, style: M2Text.sched.style(M2Color.slate)),
                        ]),
                      ),
                  ]),
          ),
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) => M2Sheet(
        handle: widget.handle, top: widget.top, onClosed: widget.onClosed, header: const SheetGrab(), landing: _landing,
        slivers: [
          SliverToBoxAdapter(
            child: ListenableBuilder(
              listenable: widget.data,
              builder: (_, _) {
                final s = widget.schedule();
                return Column(key: _body, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      const SizedBox(height: M2Layout.schedNameTop),
                      Semantics(header: true, child: Text(s.name, style: M2Text.schedHead.style(M2Color.dm))),
                      const SizedBox(height: M2Layout.schedRowTop),
                      Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(s.address, style: M2Text.sched.style(M2Color.slate)),
                            if (s.building != null) Text(s.building!, style: M2Text.sched.style(M2Color.slate)),
                          ]),
                        ),
                        if (s.mapAddress != null) ...[
                          const SizedBox(width: M2Space.panel),
                          Button(kind: ButtonKind.directions, label: 'Directions', onTap: () => _directions(s.mapAddress!)),
                        ],
                      ]),
                      if (s.payment != null && s.payment!.isNotEmpty) ...[
                        const SizedBox(height: M2Layout.schedPayTop),
                        Text.rich(TextSpan(style: M2Text.sched.style(M2Color.slate), children: [
                          const TextSpan(text: 'Payment', style: TextStyle(color: M2Color.dm, fontWeight: FontWeight.w600)),
                          const WidgetSpan(child: SizedBox(width: M2Layout.markGap)),
                          TextSpan(text: s.payment),
                        ])),
                      ],
                    ]),
                  ),
                  const SizedBox(height: M2Layout.schedDaysTop),
                  Container(
                    decoration: const BoxDecoration(border: Border(top: BorderSide(color: M2Color.hair))),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final d in s.days) _day(d)]),
                  ),
                  if (s.description != null && s.description!.isNotEmpty)
                    Padding(padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.schedDescTop, M2Space.gutter, 0), child: Text(s.description!, style: M2Text.ing.style(M2Color.ink))),
                ]);
              },
            ),
          ),
        ],
      );
}
