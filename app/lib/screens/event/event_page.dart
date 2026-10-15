import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/m2/board.dart';
import '../../core/m2/events.dart';
import '../../core/types.dart' show DiningEvent;
import '../../data/states.dart';
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../halls/hall_page.dart';
import '../hall/hall_controller.dart' show hoursEvents;
import 'event_banner.dart';

/// M2's event page (`pageContent('event')`), the bake-off's `event_page.dart`: the deep-maroon card's ground throughout, the bar with only
/// Back (the banner is the title), the banner framed in felt, the date in gold, then one button per link, the first gold and the rest
/// outlined. The group sits at the optical centre of what the bar leaves. [onLink] takes a link's label and address.
class EventPage extends StatelessWidget {
  const EventPage({super.key, required this.top, required this.event, required this.today, required this.onBack, required this.onLink});
  final double top;
  final HoursEvent event;
  final String today;
  final VoidCallback onBack;
  final void Function(String label, String href) onLink;

  @override
  Widget build(BuildContext context) {
    final e = event, when = eventWhen(today, e.expires), pic = e.image.isNotEmpty;
    return ColoredBox(
      color: M2Color.dm,
      child: Column(children: [
        ScreenHeader.page(top: top, title: pic ? '' : e.title, onBack: onBack, barColor: M2Color.dm),
        Expanded(
          // M2's page is the whole screen with the tab bar over its foot: the room it leaves under the group is measured from the screen's bottom
          child: LayoutBuilder(
            builder: (_, c) {
              final foot = math.max(0.0, M2Layout.listFoot + safeBottom(context) - (MediaQuery.sizeOf(context).height - c.maxHeight - M2Layout.barH - top));
              return SingleChildScrollView(
                child: Container(
                  constraints: BoxConstraints(minHeight: c.maxHeight),
                  padding: EdgeInsets.only(bottom: foot + M2Size.posterFoot),
                  alignment: Alignment.center,
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Space.eventTop, M2Space.gutter, M2Space.eventBottom),
                    child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      if (pic) Semantics(label: e.title, image: true, child: EventBanner(image: e.image, framed: true)),
                      if (when.isNotEmpty) Padding(padding: const EdgeInsets.only(top: M2Space.paragraph + M2Space.eventDate), child: Text(when, style: M2Text.pstat.style(M2Color.gold))),
                      Padding(
                        padding: const EdgeInsets.only(top: M2Space.group),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          for (var k = 0; k < e.links.length; k++) ...[
                            if (k > 0) const SizedBox(height: M2Space.eventLinks),
                            Button(kind: k == 0 ? ButtonKind.gold : ButtonKind.outline, size: ButtonSize.large, label: e.links[k][0], expand: true, onTap: () => onLink(e.links[k][0], e.links[k][1])),
                          ],
                        ]),
                      ),
                    ]),
                  ),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

/// The event page of the feed's [index]th event (the order `hoursEvents` gives, the one a hall menu's event row also names): "See the menu" lands
/// on the first hall's menu for the event's own day, every other link opens in the browser.
class EventScreen extends StatefulWidget {
  const EventScreen({super.key, required this.index, required this.top});
  final int index;
  final double top;
  @override
  State<EventScreen> createState() => _EventScreenState();
}

class _EventScreenState extends State<EventScreen> {
  StreamSubscription<DataState<List<DiningEvent>>>? _sub;
  HoursEvent? _event;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sub ??= AppScope.of(context).repo.events().listen((s) {
      if (s is! Loaded<List<DiningEvent>> || !mounted) return;
      final all = hoursEvents(s.value);
      setState(() => _event = widget.index < all.length ? all[widget.index] : null);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  void _link(HoursEvent e, String label, String href, String today) {
    if (label == 'See the menu' && e.scope.isNotEmpty) {
      final day = eventDay(today, e.expires).clamp(0, 14);
      Nav.push<void>(context, (_) => HallMenuPage(place: e.scope[0], top: widget.top, day: day));
    } else {
      launchWeb(href);
    }
  }

  @override
  Widget build(BuildContext context) {
    final e = _event, today = AppScope.of(context).repo.today;
    if (e == null) return ColoredBox(color: M2Color.dm, child: ScreenHeader.page(top: widget.top, title: '', onBack: () => Navigator.of(context).maybePop(), barColor: M2Color.dm));
    return EventPage(top: widget.top, event: e, today: today, onBack: () => Navigator.of(context).maybePop(), onLink: (l, h) => _link(e, l, h, today));
  }
}

/// Pushes the event page of the feed's [index]th event.
Future<void> openEvent(BuildContext context, int index, double top) => Nav.push<void>(context, (_) => EventScreen(index: index, top: top));

/// Opens a feed link in the browser: only an http(s) address with a host, whatever the feed says (an `intent:` or `tel:` href, or one
/// that does not parse, does nothing).
Future<void> launchWeb(String href) async {
  final u = Uri.tryParse(href);
  if (u == null || u.host.isEmpty || (u.scheme != 'http' && u.scheme != 'https')) return;
  try {
    await launchUrl(u, mode: LaunchMode.externalApplication);
  } catch (_) {}
}
