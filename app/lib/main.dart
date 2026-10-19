import 'dart:ui';
import 'package:flutter/widgets.dart';
import 'alerts/alerts.dart';
import 'app.dart';
import 'boot.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final route = PlatformDispatcher.instance.defaultRouteName;
  final boot = await Boot.open(route);
  // Recorded routes (screenshots) are throwaway: no schedule, no notifications.
  if (boot.store case final store? when !route.contains('data=recorded')) {
    try {
      await startAlerts(on: await store.alertsOn());
    } catch (e) {
      debugPrint('alerts unavailable: $e');
    }
  }
  runApp(UdineApp(initialRoute: route, boot: boot));
}
