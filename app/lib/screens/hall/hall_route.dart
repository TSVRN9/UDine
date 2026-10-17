import 'package:flutter/widgets.dart';

import '../../core/types.dart' show diningHalls;
import '../../core/m2/board.dart' show dishKey, halls;
import '../../core/m2/places.dart' show cafeTable;
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../cafes/cafes_page.dart';
import '../event/event_page.dart' show EventScreen;
import '../cafes/pdf_page.dart';
import '../halls/hall_page.dart';

/// `/hall/worcester?meal=lunch&day=2026-10-10&dish=Golden BBQ Chicken Thigh` or `/cafe/3` (a café's index) as a launch route (screenshots, deep links): the hall's menu already open, with no band
/// to grow from. Null for any other route, or a café index outside the table. `meal` is M2's key, `day` a date within the 15 days from today, `dish` a dish's name whose sheet opens over the menu.
Route<void>? hallLaunchRoute(String route, double top) {
  final u = Uri.parse(route);
  if (u.path == '/cafes') {
    return BaseRoute<void>(
      settings: RouteSettings(name: route),
      builder: (context) {
        AppScope.of(context).prefs.lastHall = 'W'; // M2's own `?state=cafes` opens with Worcester the last hall
        return CafesPage(top: top, area: int.tryParse(u.queryParameters['area'] ?? ''));
      },
    );
  }
  if (u.pathSegments.length == 4 && u.pathSegments[0] == 'cafe' && u.pathSegments[2] == 'menu') {
    final n = int.tryParse(u.pathSegments[1]), m = int.tryParse(u.pathSegments[3]);
    if (n == null || m == null || n < 0 || n >= cafeTable.length || m < 0) return null;
    return BaseRoute<void>(settings: RouteSettings(name: route), builder: (_) => PdfMenuByIndex(place: 'c$n', index: m, top: top));
  }
  if (u.pathSegments.length == 2 && u.pathSegments[0] == 'event') {
    final n = int.tryParse(u.pathSegments[1]);
    return n == null || n < 0 ? null : BaseRoute<void>(settings: RouteSettings(name: route), builder: (_) => EventScreen(index: n, top: top));
  }
  if (u.pathSegments.length != 2) return null;
  final seg = u.pathSegments[1];
  final String place;
  if (u.pathSegments[0] == 'cafe') {
    final n = int.tryParse(seg);
    if (n == null || n < 0 || n >= cafeTable.length) return null; // an index past the table opens the halls tab, not a RangeError
    place = 'c$n';
  } else if (u.pathSegments[0] == 'hall') {
    final i = diningHalls.indexWhere((h) => h.slug == seg);
    if (i < 0) return null;
    place = halls[i];
  } else {
    return null;
  }
  return BaseRoute<void>(
    settings: RouteSettings(name: route),
    builder: (context) {
      return HallMenuPage(place: place, top: top, day: _dayOffset(u.queryParameters['day'], AppScope.of(context).repo.today), meal: u.queryParameters['meal'], dish: u.queryParameters['dish']);
    },
  );
}

int _dayOffset(String? iso, String today) => iso == null ? 0 : (DateTime.parse(iso).difference(DateTime.parse(today)).inDays).clamp(0, 14);

/// A favourite-alert notification's route (`/hall/<slug>?meal=&day=&dish=`) as where Shell sends it: the place, M2's meal key, the day as an
/// offset from [today], and the dish's key. Null for any other route, an unknown hall, or no dish.
({String place, String meal, int day, String dish})? alertLanding(String route, String today) {
  final u = Uri.parse(route), q = u.queryParameters, name = q['dish'];
  if (u.pathSegments.length != 2 || u.pathSegments[0] != 'hall' || name == null) return null;
  final i = diningHalls.indexWhere((h) => h.slug == u.pathSegments[1]);
  return i < 0 ? null : (place: halls[i], meal: q['meal'] ?? 'lunch', day: _dayOffset(q['day'], today), dish: dishKey(name));
}
