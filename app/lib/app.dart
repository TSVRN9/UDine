import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'alerts/alerts.dart' show alertTaps;
import 'boot.dart';
import 'dev/kit_gallery.dart';
import 'screens/plate/plate_sheet.dart';
import 'shell/shell.dart';
import 'theme/tokens.dart';

/// The app. Routes are named by `PlatformDispatcher.defaultRouteName` (the `route` extra of `app/tool/screenshot.sh`); `boot` is what
/// they run on (null only for the kit gallery, which needs none).
class UdineApp extends StatefulWidget {
  final String initialRoute;
  final Boot? boot;
  const UdineApp({super.key, this.initialRoute = '/', this.boot});

  @override
  State<UdineApp> createState() => _UdineAppState();
}

class _UdineAppState extends State<UdineApp> {
  final _nav = GlobalKey<NavigatorState>();
  StreamSubscription<String>? _taps;

  @override
  void initState() {
    super.initState();
    // A tap on a favourite-alert notification while the app is open: Shell is rebuilt on the route (its tab, hall and dish sheet).
    // ponytail: rebuilds the whole shell, so the open tab/sheet is replaced; push onto the Hall tab's navigator if that is ever noticed.
    _taps = alertTaps.stream.listen((route) => _nav.currentState?.pushNamedAndRemoveUntil(route, (_) => false));
  }

  @override
  void dispose() {
    _taps?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.boot, initialRoute = widget.initialRoute;
    return WidgetsApp(
      navigatorKey: _nav,
      debugShowCheckedModeBanner: false,
      color: M2Color.dm,
      initialRoute: initialRoute,
      pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(settings: settings, pageBuilder: (c, _, _) => builder(c)),
      onGenerateRoute: (s) => PageRouteBuilder<void>(
        settings: s,
        pageBuilder: (_, _, _) => !kReleaseMode && Uri.parse(s.name ?? '/').path == '/kit' ? const KitGallery() : b == null ? const ColoredBox(color: M2Color.dm) : b.wrap(Shell(initialRoute: s.name ?? '/', plateBar: const PlateSheet())),
      ),
    );
  }
}
