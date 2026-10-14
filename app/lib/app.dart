import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'dev/kit_gallery.dart';
import 'theme/tokens.dart';

/// The app shell. Routes are named by `PlatformDispatcher.defaultRouteName` (the `route` extra of `app/tool/screenshot.sh`).
class UdineApp extends StatelessWidget {
  final String initialRoute;
  const UdineApp({super.key, this.initialRoute = '/'});

  @override
  Widget build(BuildContext context) => WidgetsApp(
        color: M2Color.dm,
        initialRoute: initialRoute,
        pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(settings: settings, pageBuilder: (c, _, _) => builder(c)),
        onGenerateRoute: (s) => PageRouteBuilder<void>(
          settings: s,
          pageBuilder: (_, _, _) => !kReleaseMode && s.name == '/kit' ? const KitGallery() : const ColoredBox(color: M2Color.dm),
        ),
      );
}
