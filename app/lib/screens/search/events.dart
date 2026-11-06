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

/// Search's idle state (M2 `#sdisc`): "Events" and a row of cards on the deep-maroon band, each opening its event page. The block holds
/// its final layout from the first frame (placeholder cards on the felt until the feed answers, so the rows below never wait and are never
/// pushed down); with no event that hasn't expired, or a feed that failed, it glides shut over `settle` and the rows below glide up.
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
  bool _answered = false; // the events are known (read already, or the feed has answered, even with none)
  bool _waited = false; // a placeholder was drawn: the cards that replace it fade their captions in

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_sub != null) return;
    final repo = AppScope.of(context).repo, seen = repo.eventsSeen;
    if (seen != null) {
      _events = hoursEvents(seen);
      _answered = true;
    }
    _sub = repo.events().listen((s) {
      if (!mounted) return;
      if (s is Loaded<List<DiningEvent>> || s is LoadedOffline<List<DiningEvent>>) {
        final v = s is Loaded<List<DiningEvent>> ? s.value : (s as LoadedOffline<List<DiningEvent>>).value;
        setState(() {
          _events = hoursEvents(v);
          _answered = true;
        });
      } else if (s is NotSaved<List<DiningEvent>> || s is Failed<List<DiningEvent>>) {
        setState(() => _answered = true);
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
    final repo = AppScope.of(context).repo, today = repo.today, nowSec = repo.now().millisecondsSinceEpoch ~/ 1000, a = resolveAnim(context, M2Motion.settle);
    // the feed's index stays the event's id, so a card opens the page a hall menu's row names
    final live = [for (var i = 0; i < _events.length; i++) if (_events[i].expires > nowSec) (i, _events[i])];
    final show = !_answered || live.isNotEmpty;
    if (!_answered) _waited = true;
    return AnimatedSize(
      duration: a.duration, curve: a.curve, alignment: Alignment.topCenter,
      child: !show ? const SizedBox.shrink() : Container(
        color: M2Color.dm,
        padding: const EdgeInsets.only(top: M2Layout.evBandTop, bottom: M2Layout.evBandBottom),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.evHeadTop, M2Space.gutter, 0),
            child: Semantics(header: true, child: Text('Events', style: M2Text.section.style(M2Color.white))),
          ),
          LayoutBuilder(builder: (_, c) {
            final one = _answered && live.length == 1, w = one ? c.maxWidth - M2Layout.evcStart : M2Layout.evCardW;
            // before the answer: as many placeholder cards as fill the row
            final n = _answered ? live.length : ((c.maxWidth - M2Layout.evcStart) / (w + M2Layout.evcGap)).ceil();
            return SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              physics: _Snap(w + M2Layout.evcGap),
              padding: const EdgeInsets.fromLTRB(M2Layout.evcStart, M2Layout.evcTop, 0, M2Layout.evcBottom),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                for (var k = 0; k < n; k++) ...[
                  SizedBox(
                    width: w,
                    child: !_answered ? const _EventPlaceholder() : EventCard(event: live[k].$2, today: today, fade: _waited, onTap: () {
                      FocusManager.instance.primaryFocus?.unfocus(); // the route restores the focus it left, so Search must not be holding the field
                      widget.onOpen != null ? widget.onOpen!(live[k].$1) : openEvent(context, live[k].$1, widget.top);
                    }),
                  ),
                  if (k < n - 1) const SizedBox(width: M2Layout.evcGap),
                ],
                if (!one) const SizedBox(width: M2Layout.evcTail + M2Layout.evcGap),
              ]),
            );
          }),
        ]),
      ),
    );
  }
}

/// A card before the feed has answered: the banner's felt (shimmering) and the title line's height, nothing written.
class _EventPlaceholder extends StatelessWidget {
  const _EventPlaceholder();
  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const EventBanner(loading: true),
          Padding(
            padding: const EdgeInsets.only(top: M2Layout.evCapTop),
            // the caption row's own height (the title's line and the date's baseline-aligned), with only blanks written
            child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
              Expanded(child: Text('\u00A0', style: M2Layout.evTitle.style(M2Layout.evTitleColor))),
              Text('\u00A0', style: M2Layout.evTag.style(M2Color.gold)),
            ]),
          ),
        ]),
      );
}

/// One card (M2 `.evcard`): the banner, then the title and, in gold Oswald, the date. [fade]: it replaces a placeholder, so the caption comes in
/// over `settle`.
class EventCard extends StatelessWidget {
  const EventCard({super.key, required this.event, required this.today, required this.onTap, this.fade = false});
  final HoursEvent event;
  final String today;
  final VoidCallback onTap;
  final bool fade;

  @override
  Widget build(BuildContext context) {
    final when = eventWhen(today, event.expires), a = resolveAnim(context, M2Motion.settle);
    return Press(
      overlay: M2Color.pressOnDm, label: when.isEmpty ? event.title : '${event.title}, $when', onTap: onTap,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        EventBanner(image: event.image, cache: AppScope.of(context).repo.images),
        TweenAnimationBuilder<double>(
          tween: Tween(begin: fade ? 0.0 : 1.0, end: 1.0), duration: a.duration, curve: a.curve,
          builder: (_, v, child) => Opacity(opacity: v, child: child),
          child: Padding(
            padding: const EdgeInsets.only(top: M2Layout.evCapTop),
            child: Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
              Expanded(child: Text(event.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: M2Layout.evTitle.style(M2Layout.evTitleColor))),
              if (when.isNotEmpty) ...[const SizedBox(width: M2Layout.evCapGap), Text(when, style: M2Layout.evTag.style(M2Color.gold))],
            ]),
          ),
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
