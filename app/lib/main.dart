import 'dart:ui';
import 'package:flutter/widgets.dart';
import 'alerts/alerts.dart';
import 'app.dart';
import 'boot.dart';
import 'screens/dish/where_book.dart' show WhereWarm;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  WhereWarm.auto = true;
  final route = PlatformDispatcher.instance.defaultRouteName;
  final boot = await Boot.open(route);
  // Recorded routes (screenshots) are throwaway: no schedule, no notifications.
  if (boot.store case final store? when !route.contains('data=recorded')) {
    try {
      await startAlerts(on: await store.alertsOn());
      await boot.alerts.refresh(); // topic sync at launch
    } catch (e) {
      debugPrint('alerts unavailable: $e');
    }
  }
  runApp(UdineApp(initialRoute: route, boot: boot));
}
