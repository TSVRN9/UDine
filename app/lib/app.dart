import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'alerts/alerts.dart' show alertTaps, takeHeldTap;
import 'boot.dart';
import 'debug/store_page.dart';
import 'dev/kit_gallery.dart';
import 'screens/plate/plate_sheet.dart';
import 'shell/shell.dart';
import 'theme/tokens.dart';

/// The app. Routes are named by `PlatformDispatcher.defaultRouteName` (the `route` extra of `app/tool/screenshot.sh`); `boot` is what
/// they run on (null only for the kit gallery, which needs none).
class UdineApp extends StatefulWidget {
  final String initialRoute;
  final Boot? boot;
  /// Debug-only routes (`/kit`, `/debug/store`) exist unless [release]; a test passes true to see the release build's routes.
  final bool release;
  const UdineApp({super.key, this.initialRoute = '/', this.boot, this.release = kReleaseMode});

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
    void open(String route) => _nav.currentState?.pushNamedAndRemoveUntil(route, (_) => false);
    _taps = alertTaps.stream.listen(open);
    if (takeHeldTap() case final route?) WidgetsBinding.instance.addPostFrameCallback((_) => open(route));
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
        pageBuilder: (_, _, _) => !release && Uri.parse(s.name ?? '/').path == '/kit' ? const KitGallery() : !release && b != null && Uri.parse(s.name ?? '/').path == '/debug/store' ? StorePage(db: b.store?.db) : b == null ? const ColoredBox(color: M2Color.dm) : b.wrap(Shell(initialRoute: s.name ?? '/', plateBar: const PlateSheet())),
      ),
    );
  }
}
