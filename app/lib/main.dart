import 'dart:ui';
import 'package:flutter/widgets.dart';
import 'app.dart';
import 'boot.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final route = PlatformDispatcher.instance.defaultRouteName;
  runApp(UdineApp(initialRoute: route, boot: await Boot.open(route)));
}
