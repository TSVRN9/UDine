import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';
import '../logic/fixture.dart';
import '../logic/schedule.dart';
import '../theme/tokens.dart';
import '../ui/sheet.dart';
import '../ui/ui.dart';

/// M2's schedule (round 9): the place's address and Directions, then the fifteen days in date order, the chosen one open in place with
/// each meal's window. A day row picks that day. It opens already scrolled so the chosen day and its hours are on screen at rest:
/// the offset is worked out from the laid-out rows before the sheet is visible, so nothing scrolls after it is drawn.
class HoursSheet extends StatefulWidget {
  final SheetHandle handle;
  final double top;
  final Fixture fx;
  final String place;
  final int chosen;
  final ValueChanged<int> onPick;
  final VoidCallback onClosed;
  const HoursSheet({super.key, required this.handle, required this.top, required this.fx, required this.place, required this.chosen, required this.onPick, required this.onClosed});
  @override
  State<HoursSheet> createState() => _HoursSheetState();
}

class _HoursSheetState extends State<HoursSheet> {
  final _body = GlobalKey(), _end = GlobalKey();

  double? _landing(SheetMetrics m, double mid) {
    final body = _body.currentContext?.findRenderObject() as RenderBox?, end = _end.currentContext?.findRenderObject() as RenderBox?;
    if (body == null || end == null) return null;
    final bottom = end.localToGlobal(Offset(0, end.size.height), ancestor: body).dy + M2Layout.landingSlack;
    final visible = mid - M2Layout.grabH; // the sheet's resting height under its pinned grab
    return bottom > visible ? bottom - visible : null;
  }

  void _directions(String? mapAddress) async {
    if (mapAddress == null) return;
    try {
      await launchUrl(mapsUri(mapAddress), mode: LaunchMode.externalApplication);
    } catch (_) {/* no maps app: nothing to open */}
  }

  @override
  Widget build(BuildContext context) {
    final w = widget, s = schedule(w.fx, w.place, w.chosen);
    Widget day(SchedDay d) {
      final open = d.current && (d.meals.isNotEmpty || d.event != null);
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _DayRow(label: d.label, right: d.right, current: d.current, onTap: () => w.onPick(d.i)),
        if (open)
          NegMargin(
            top: M2Layout.mwsTop,
            child: Container(
            key: _end,
            padding: const EdgeInsets.fromLTRB(M2Layout.mwsPadLeft, 0, M2Space.gutter, M2Layout.mwsPadBottom),
            decoration: const BoxDecoration(border: Border(left: BorderSide(width: M2Layout.optionEdge, color: M2Color.vm))),
            child: d.event != null
                ? Press(
                    overlay: M2Color.pressRow, label: d.event!.title, onTap: () => launchUrl(Uri.parse(d.event!.href), mode: LaunchMode.externalApplication).catchError((_) => false),
                    child: SizedBox(height: M2Layout.evRowH, child: Row(children: [Expanded(child: Text(d.event!.title, style: M2Text.link.style(M2Color.dm))), const Chevron()])),
                  )
                : Column(children: [
                    for (final m in d.meals)
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        Text(m.label, style: M2Text.sched.style(M2Color.ink)),
                        Text(m.window, style: M2Text.sched.style(M2Color.slate)),
                      ]),
                  ]),
            ),
          ),
      ]);
    }

    return M2Sheet(
      handle: w.handle, top: w.top, onClosed: w.onClosed, header: const SheetGrab(), landing: _landing,
      slivers: [
        SliverToBoxAdapter(
          child: Column(key: _body, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
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
                    const SizedBox(width: M2Space.panel),
                    Button(kind: ButtonKind.directions, label: 'Directions', onTap: () => _directions(s.mapAddress)),
                  ]),
                  if (s.payment != null && s.payment!.isNotEmpty) ...[
                    const SizedBox(height: M2Layout.schedPayTop),
                    Text.rich(TextSpan(style: M2Text.sched.style(M2Color.slate), children: [
                      TextSpan(text: 'Payment', style: TextStyle(color: M2Color.dm, fontWeight: FontWeight.w600)),
                      const WidgetSpan(child: SizedBox(width: M2Layout.markGap)),
                      TextSpan(text: s.payment),
                    ])),
                  ],
                ]),
              ),
              const SizedBox(height: M2Layout.schedDaysTop),
              Container(
                decoration: const BoxDecoration(border: Border(top: BorderSide(color: M2Color.hair))),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final d in s.days) day(d)]),
              ),
              if (s.description != null && s.description!.isNotEmpty)
                Padding(padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.schedDescTop, M2Space.gutter, 0), child: Text(s.description!, style: M2Text.ing.style(M2Color.ink))),
            ]),
        ),
      ],
    );
  }
}

/// `#days .day`: a day's name, and on the right its span or what it is (15, slate; maroon on the current day).
class _DayRow extends StatelessWidget {
  final String label, right;
  final bool current;
  final VoidCallback onTap;
  const _DayRow({required this.label, required this.right, required this.current, required this.onTap});
  @override
  Widget build(BuildContext context) => Semantics(
        selected: current, button: true, label: '$label${right.isEmpty ? '' : ', $right'}',
        child: Press(
          semantics: false, overlay: M2Color.pressRow, onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: M2Layout.optionH),
            padding: const EdgeInsets.only(left: M2Space.action, right: M2Space.gutter),
            decoration: BoxDecoration(border: Border(left: BorderSide(width: M2Layout.optionEdge, color: current ? M2Color.vm : M2Color.chalk.withValues(alpha: 0)))),
            child: ExcludeSemantics(
              child: Row(children: [
                Expanded(child: Text(label, style: M2Text.dayRow.style(current ? M2Color.vm : M2Color.ink).copyWith(fontWeight: current ? bold700 : FontWeight.w500))),
                const SizedBox(width: M2Space.panel),
                Text(right, style: M2Text.sched.style(current ? M2Color.vm : M2Color.slate).copyWith(fontWeight: current ? FontWeight.w500 : FontWeight.w400)),
              ]),
            ),
          ),
        ),
      );
}
