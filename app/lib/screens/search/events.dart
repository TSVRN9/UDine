import 'dart:async';
import 'package:flutter/widgets.dart';
import '../../core/m2/board.dart';
import '../../core/m2/events.dart';
import '../../core/types.dart' show DiningEvent;
import '../../data/states.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../event/event_banner.dart';
import '../event/event_page.dart';
import '../hall/hall_controller.dart' show hoursEvents;

/// Search's idle state (M2 `#sdisc`): "Events" and a row of cards on the deep-maroon band, each opening its event page. Nothing at all
/// when the feed has no event that hasn't expired. The feed's own failure is the same: no events, no band.
class EventsIdle extends StatefulWidget {
  const EventsIdle({super.key, required this.top, this.onOpen});
  final double top;
  /// replaces the push of the event page (tests)
  final void Function(int index)? onOpen;
  @override
  State<EventsIdle> createState() => _EventsIdleState();
}

class _EventsIdleState extends State<EventsIdle> {
  StreamSubscription<DataState<List<DiningEvent>>>? _sub;
  List<HoursEvent> _events = const [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sub ??= AppScope.of(context).repo.events().listen((s) {
      if (s is Loaded<List<DiningEvent>> || s is LoadedOffline<List<DiningEvent>>) {
        final v = s is Loaded<List<DiningEvent>> ? s.value : (s as LoadedOffline<List<DiningEvent>>).value;
        if (mounted) setState(() => _events = hoursEvents(v));
      }
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final repo = AppScope.of(context).repo, today = repo.today, nowSec = repo.now().millisecondsSinceEpoch ~/ 1000;
    // the feed's index stays the event's id, so a card opens the page a hall menu's row names
    final live = [for (var i = 0; i < _events.length; i++) if (_events[i].expires > nowSec) (i, _events[i])];
    if (live.isEmpty) return const SizedBox.shrink();
    return Container(
      color: M2Color.dm,
      padding: const EdgeInsets.only(top: M2Layout.evBandTop, bottom: M2Layout.evBandBottom),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.evHeadTop, M2Space.gutter, 0),
          child: Semantics(header: true, child: Text('Events', style: M2Text.section.style(M2Color.white))),
        ),
        LayoutBuilder(builder: (_, c) {
          final one = live.length == 1, w = one ? c.maxWidth - M2Layout.evcStart : M2Layout.evCardW;
          return SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            physics: _Snap(w + M2Layout.evcGap),
            padding: const EdgeInsets.fromLTRB(M2Layout.evcStart, M2Layout.evcTop, 0, M2Layout.evcBottom),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (final (i, e) in live) ...[
                SizedBox(width: w, child: EventCard(event: e, today: today, onTap: () => widget.onOpen != null ? widget.onOpen!(i) : openEvent(context, i, widget.top))),
                if (e != live.last.$2) const SizedBox(width: M2Layout.evcGap),
              ],
              if (!one) const SizedBox(width: M2Layout.evcTail + M2Layout.evcGap),
            ]),
          );
        }),
      ]),
    );
  }
}

/// One card (M2 `.evcard`): the banner, then the title and, in gold Oswald, the date.
class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event, required this.today, required this.onTap});
  final HoursEvent event;
  final String today;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final when = eventWhen(today, event.expires);
    return Press(
      overlay: M2Color.pressOnDm, label: when.isEmpty ? event.title : '${event.title}, $when', onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        EventBanner(image: event.image),
        Padding(
          padding: const EdgeInsets.only(top: M2Layout.evCapTop),
          child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
            Expanded(child: Text(event.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: M2Layout.evTitle.style(M2Layout.evTitleColor))),
            if (when.isNotEmpty) ...[const SizedBox(width: M2Layout.evCapGap), Text(when, style: M2Layout.evTag.style(M2Color.gold))],
          ]),
        ),
      ]),
    );
  }
}

/// `scroll-snap-type: x mandatory` with `scroll-snap-align: start`: a fling comes to rest on a card's left edge.
class _Snap extends ScrollPhysics {
  const _Snap(this.step, {super.parent});
  final double step;
  @override
  _Snap applyTo(ScrollPhysics? ancestor) => _Snap(step, parent: buildParent(ancestor));

  @override
  Simulation? createBallisticSimulation(ScrollMetrics m, double velocity) {
    if ((velocity <= 0 && m.pixels <= m.minScrollExtent) || (velocity >= 0 && m.pixels >= m.maxScrollExtent)) return super.createBallisticSimulation(m, velocity);
    final tol = toleranceFor(m), at = m.pixels / step;
    final target = ((velocity.abs() < tol.velocity ? at.round() : velocity > 0 ? at.ceil() : at.floor()) * step).clamp(m.minScrollExtent, m.maxScrollExtent);
    return target == m.pixels ? null : ScrollSpringSimulation(spring, m.pixels, target, velocity, tolerance: tol);
  }

  @override
  bool get allowImplicitScrolling => false;
}
