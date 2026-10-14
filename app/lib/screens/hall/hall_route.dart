import 'package:flutter/widgets.dart';

import '../../core/types.dart' show diningHalls;
import '../../core/m2/board.dart' show halls;
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../halls/hall_page.dart';

/// `/hall/worcester?meal=lunch&day=2026-10-10` as a launch route (screenshots, deep links): the hall's menu already open, with no band
/// to grow from. Null for any other route. `meal` is M2's key, `day` a date within the 15 days from today.
Route<void>? hallLaunchRoute(String route, double top) {
  final u = Uri.parse(route);
  if (u.pathSegments.length != 2 || u.pathSegments[0] != 'hall') return null;
  final i = diningHalls.indexWhere((h) => h.slug == u.pathSegments[1]);
  if (i < 0) return null;
  return BaseRoute<void>(
    settings: RouteSettings(name: route),
    builder: (context) {
      final iso = u.queryParameters['day'], today = AppScope.of(context).repo.today;
      final day = iso == null ? 0 : (DateTime.parse(iso).difference(DateTime.parse(today)).inDays).clamp(0, 14);
      return HallMenuPage(place: halls[i], top: top, day: day, meal: u.queryParameters['meal']);
    },
  );
}
