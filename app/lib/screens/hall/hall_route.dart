import 'package:flutter/widgets.dart';

import '../../core/types.dart' show diningHalls;
import '../../core/m2/board.dart' show halls;
import '../../core/m2/places.dart' show cafeTable;
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../cafes/cafes_page.dart';
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
      final iso = u.queryParameters['day'], today = AppScope.of(context).repo.today;
      final day = iso == null ? 0 : (DateTime.parse(iso).difference(DateTime.parse(today)).inDays).clamp(0, 14);
      return HallMenuPage(place: place, top: top, day: day, meal: u.queryParameters['meal'], dish: u.queryParameters['dish']);
    },
  );
}
