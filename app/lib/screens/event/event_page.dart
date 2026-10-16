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
import '../hall/hall_controller.dart' show hoursEvents;
import 'event_banner.dart';
import 'event_flyer.dart';

/// M2's event page (`pageContent('event')`), the bake-off's `event_page.dart`: the deep-maroon card's ground throughout, the bar with only
/// Back (the banner is the title), the banner framed in felt, the date in gold, then one button per link, the first gold and the rest
/// outlined. The group sits at the optical centre of what the bar leaves. [onLink] takes a link's label and address; [onShare] shares the
/// flyer (its button follows the links). A flyer in full sits between the date and the buttons, so the group may outgrow the screen and scroll.
class EventPage extends StatelessWidget {
  const EventPage({super.key, required this.top, required this.event, required this.today, required this.onBack, required this.onLink, required this.onShare});
  final double top;
  final HoursEvent event;
  final String today;
  final VoidCallback onBack;
  final void Function(String label, String href) onLink;
  final Future<void> Function() onShare;

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
                      if (e.flyer.isNotEmpty) Padding(padding: const EdgeInsets.only(top: M2Space.group), child: FlyerPicture(url: e.flyer)),
                      Padding(
                        padding: const EdgeInsets.only(top: M2Space.group),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                          for (var k = 0; k < e.links.length; k++) ...[
                            if (k > 0) const SizedBox(height: M2Space.eventLinks),
                            Button(kind: k == 0 ? ButtonKind.gold : ButtonKind.outline, size: ButtonSize.large, label: e.links[k][0], expand: true, onTap: () => onLink(e.links[k][0], e.links[k][1])),
                          ],
                          if (e.flyer.isNotEmpty) ...[
                            if (e.links.isNotEmpty) const SizedBox(height: M2Space.eventLinks),
                            _ShareButton(kind: e.links.isEmpty ? ButtonKind.gold : ButtonKind.outline, onShare: onShare),
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

/// "Share the flyer": a second tap while the first is out does nothing, and a failed share says so under the button.
class _ShareButton extends StatefulWidget {
  const _ShareButton({required this.kind, required this.onShare});
  final ButtonKind kind;
  final Future<void> Function() onShare;
  @override
  State<_ShareButton> createState() => _ShareButtonState();
}

class _ShareButtonState extends State<_ShareButton> {
  bool _busy = false, _failed = false;

  Future<void> _tap() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    var failed = false;
    try {
      await widget.onShare();
    } catch (_) {
      failed = true;
    }
    if (mounted) {
      setState(() {
        _busy = false;
        _failed = failed;
      });
    }
  }

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Button(kind: widget.kind, size: ButtonSize.large, label: 'Share the flyer', expand: true, onTap: _tap),
        if (_failed) Padding(padding: const EdgeInsets.only(top: M2Space.eventLinks), child: Text("Couldn't share the flyer", textAlign: TextAlign.center, style: M2Text.pstat.style(M2Color.gold))),
      ]);
}

/// The event page of the feed's [index]th event (the order `hoursEvents` gives, the one a hall menu's event row also names): every link
/// opens in the browser, and the flyer shares as an image.
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
      final value = switch (s) { Loaded(:final value) || LoadedOffline(:final value) => value, _ => null };
      if (value == null || !mounted) return;
      final all = hoursEvents(value);
      setState(() => _event = widget.index < all.length ? all[widget.index] : null);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final e = _event, today = AppScope.of(context).repo.today;
    if (e == null) return ColoredBox(color: M2Color.dm, child: ScreenHeader.page(top: widget.top, title: '', onBack: () => Navigator.of(context).maybePop(), barColor: M2Color.dm));
    return EventPage(top: widget.top, event: e, today: today, onBack: () => Navigator.of(context).maybePop(), onLink: (_, h) => launchWeb(h), onShare: () => AppScope.of(context).shareFlyer(e.flyer));
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
