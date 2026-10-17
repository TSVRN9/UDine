import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'boot.dart';
import 'debug/store_page.dart';
import 'dev/kit_gallery.dart';
import 'screens/plate/plate_sheet.dart';
import 'shell/shell.dart';
import 'theme/tokens.dart';

/// The app. Routes are named by `PlatformDispatcher.defaultRouteName` (the `route` extra of `app/tool/screenshot.sh`); `boot` is what
/// they run on (null only for the kit gallery, which needs none).
class UdineApp extends StatelessWidget {
  final String initialRoute;
  final Boot? boot;
  /// Debug-only routes (`/kit`, `/debug/store`) exist unless [release]; a test passes true to see the release build's routes.
  final bool release;
  const UdineApp({super.key, this.initialRoute = '/', this.boot, this.release = kReleaseMode});

  @override
  Widget build(BuildContext context) {
    final b = boot;
    return WidgetsApp(
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
