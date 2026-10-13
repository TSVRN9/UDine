import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import 'package:url_launcher/url_launcher.dart';
import '../logic/fixture.dart';
import '../state/store.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

// The banners are 1024 x 432 (M2 `.evpatch{aspect-ratio:1024/432}`); only the ones bundled draw (a missing one leaves the felt's maroon).
const _banner = 1024 / 432;
const _bannerFile = {
  'Indigenous Peoples Day': 'ipd.jpg',
  'October Event': 'oct.jpg',
  'Pete and Gerry': 'pg.jpg',
  'Sustainability is on the menu': 'sust.jpg',
};

/// "Mon, Oct 12" within a week of the clock, "Through Oct 31" within two months, nothing for an ongoing promotion (M2 `evWhen`).
String eventWhen(Fixture fx, FixtureEvent e) {
  final d = DateTime.fromMillisecondsSinceEpoch(e.expires * 1000, isUtc: true),
      days =
          (e.expires * 1000 - DateTime.parse(fx.clock).millisecondsSinceEpoch) /
          864e5;
  const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      mo = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
  if (days <= 7) return '${wd[d.weekday - 1]}, ${mo[d.month - 1]} ${d.day}';
  return days <= 60 ? 'Through ${mo[d.month - 1]} ${d.day}' : '';
}

/// M2's event page for a banner event (`pageContent('event')`): the deep-maroon card's ground throughout, the bar with only Back (the
/// banner is the title), the banner framed in felt with the stitching run in the felt around the picture, the date in gold, then one
/// button per link, the first gold and the rest outlined. The group sits at the optical centre of what the bar leaves. It is pushed from
/// the right like every page.
class EventPage extends StatelessWidget {
  final double top;
  final int index;
  final VoidCallback onBack;
  const EventPage({
    super.key,
    required this.top,
    required this.index,
    required this.onBack,
  });

  @override
  Widget build(BuildContext context) {
    final fx = StoreScope.of(context).fx,
        e = fx.events[index],
        when = eventWhen(fx, e),
        file = _bannerFile[e.title];
    final banner = Semantics(
      label: e.title,
      image: true,
      child: Container(
        // the white ring is outside the patch (M2 `box-shadow: 0 0 0 3px #fff`), so it takes no room
        decoration: const BoxDecoration(
          borderRadius: BorderRadius.all(Radius.circular(M2Felt.frameRadius)),
          boxShadow: [
            BoxShadow(color: M2Color.white, spreadRadius: M2Size.ring),
          ],
        ),
        child: AspectRatio(
          aspectRatio: _banner,
          child: Felt(
            color: M2Color.vm,
            stitch: M2Color.stitchGold,
            radius: M2Felt.frameRadius,
            inset: M2Felt.frameInset,
            innerRadius: M2Felt.frameStitchRadius,
            stitchWidth: M2Felt.frameStitchWidth,
            padding: const EdgeInsets.all(M2Felt.framePad),
            child: Photos.enabled && file != null
                ? ClipRRect(
                    borderRadius: const BorderRadius.all(
                      Radius.circular(M2Radius.image),
                    ),
                    child: Image.asset(
                      'assets/bakeoff/ev/$file',
                      fit: BoxFit.cover,
                      width: double.infinity,
                      height: double.infinity,
                      errorBuilder: (_, _, _) => const SizedBox.shrink(),
                    ),
                  )
                : const SizedBox.expand(),
          ),
        ),
      ),
    );
    return ColoredBox(
      color: M2Color.dm,
      child: Column(
        children: [
          ScreenHeader.page(
            top: top,
            title: file == null ? e.title : '',
            onBack: onBack,
            barColor: M2Color.dm,
          ),
          Expanded(
            // M2's page is the whole screen with the tab bar over its foot: the room it leaves under the group is measured from the screen's bottom
            child: LayoutBuilder(
              builder: (_, c) => Padding(
                padding: EdgeInsets.only(
                  bottom: math.max(
                    0.0,
                    M2Layout.listFoot +
                        safeBottom(context) -
                        (MediaQuery.sizeOf(context).height -
                            c.maxHeight -
                            M2Layout.barH -
                            top),
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.only(bottom: M2Size.posterFoot),
                  child: Center(
                    child: SingleChildScrollView(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(
                          M2Space.gutter,
                          M2Space.eventTop,
                          M2Space.gutter,
                          M2Space.eventBottom,
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            banner,
                            if (when.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(
                                  top: M2Space.paragraph + M2Space.eventDate,
                                ),
                                child: Text(
                                  when,
                                  style: M2Text.barNum.normal().style(
                                    M2Color.gold,
                                  ),
                                ),
                              ),
                            Padding(
                              padding: const EdgeInsets.only(
                                top: M2Space.group,
                              ),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  for (var k = 0; k < e.links.length; k++) ...[
                                    if (k > 0)
                                      const SizedBox(
                                        height: M2Space.eventLinks,
                                      ),
                                    Button(
                                      kind: k == 0
                                          ? ButtonKind.gold
                                          : ButtonKind.outline,
                                      size: ButtonSize.large,
                                      label: e.links[k][0],
                                      expand: true,
                                      onTap: () => launchUrl(
                                        Uri.parse(e.links[k][1]),
                                        mode: LaunchMode.externalApplication,
                                      ).catchError((_) => false),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
