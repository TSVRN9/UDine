import 'board.dart';
import 'menu_view.dart';
import 'status.dart';
import 'where.dart';

/// What the network does (M2's `?net=`). ponytail: owned by flutter-port-menu-data once the real fetch lands; only the schedule reads it here.
enum NetMode { ok, slow, offline, fail }

class SchedDay {
  final int i;
  final String label, right;
  final bool current;
  final List<({String label, String window})> meals;
  /// the hours event that replaces the day's windows (a holiday), opened by its first link
  final ({String title, String href, int index})? event;
  const SchedDay(this.i, this.label, this.right, this.current, this.meals, this.event);
}

class Schedule {
  final String name, address;
  final String? mapAddress, building, payment, description;
  final List<SchedDay> days;
  const Schedule(this.name, this.address, this.mapAddress, this.building, this.payment, this.description, this.days);
}

String _span(String o, String c) => '${fmtT(o)} to ${fmtT(c)}';
int _evDay(Board fx, HoursEvent e) => dayIsos(fx).indexOf(DateTime.fromMillisecondsSinceEpoch(e.expires * 1000, isUtc: true).toIso8601String().substring(0, 10));

/// M2 evOn: an event shows on its own day's menu, at the halls its scope names.
bool eventOn(Board fx, HoursEvent e, String place, int i) => !isCafe(place) && e.scope.contains(place) && _evDay(fx, e) == i;

/// The status line under the name: today's status, or another day's span when the place posts a menu that day.
String statusLine(Board fx, String place, int i) {
  final g = fx.hours[place]!.general;
  if (i == 0) return statusText(fx.hours[place]!, fx.clock);
  return g != null && fx.days[dayIsos(fx)[i]]?[place] != null ? _span(g.openTime, g.closeTime) : '';
}

/// M2 schedHTML: the address, then the days in date order with the chosen one open in place. `mode` is M2's one `?net=`; on live data
/// each day has its own state, which `modeOf` gives instead: `ok` loaded, `slow` still loading, `offline` not saved on the phone,
/// `fail` didn't load (the last three have no hours and don't open).
Schedule schedule(Board fx, String place, int chosen, {NetMode mode = NetMode.ok, bool hours = true, NetMode Function(int day)? modeOf}) {
  final p = fx.places.firstWhere((q) => q.key == place), g = fx.hours[place]!.general, cafe = isCafe(place);
  final isos = dayIsos(fx), menu = hasMenu(fx, place);
  final list = menu ? isos : [isos.first]; // a café without a dish menu has no days to pick, only today's hours
  final now = fx.clock;
  final days = [
    for (var i = 0; i < list.length; i++)
      () {
        if (!menu) return SchedDay(i, 'Today', hours && g != null ? _span(g.openTime, g.closeTime) : '', true, const [], null);
        // M2: offline, the days past tomorrow are not saved; failed, nothing is known, so no row has hours and none opens
        final m = modeOf?.call(i) ?? (mode == NetMode.offline && i > 1 ? NetMode.offline : mode == NetMode.fail ? NetMode.fail : NetMode.ok);
        final menus = m == NetMode.ok ? (fx.days[list[i]]?[place]) : null, cur = i == chosen;
        final ev = fx.events.where((e) => eventOn(fx, e, place, i)).firstOrNull;
        final right = m == NetMode.offline ? 'Not saved' : m != NetMode.ok ? '' : menus == null ? 'No menu posted' : ev != null ? 'Holiday hours' : cur && g != null && hours ? _span(g.openTime, g.closeTime) : '';
        final meals = menus != null && cur && ev == null
            ? [
                for (final m in mealOrder.where(menus.containsKey))
                  () {
                    final w = mealWindow(fx, place, m, now);
                    return (label: m == 'grab' ? "Grab 'N Go" : mealLabel[m]!, window: w != null ? _span(w.$1, w.$2) : '');
                  }(),
              ]
            : const <({String label, String window})>[];
        final event = menus != null && cur && ev != null
            ? (title: ev.hoursTitle ?? ev.title, href: (ev.links.where((l) => l[0] == 'Holiday hours').firstOrNull ?? ev.links.firstOrNull)?[1] ?? '', index: fx.events.indexOf(ev))
            : null;
        return SchedDay(i, dayLong(fx, i), right, cur, meals, event);
      }(),
  ];
  return Schedule(p.name, p.address ?? '', p.mapAddress, cafe ? p.building : null, cafe ? p.payment : null, cafe ? p.description : null, days);
}

/// The maps URL Directions hands to the phone (M2 `mapsURL`, Android's form: the platform app is the target).
Uri mapsUri(String latLong) => Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(latLong)}');

