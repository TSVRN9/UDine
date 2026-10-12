import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'logic/fixture.dart';
import 'screens/halls.dart';
import 'theme/tokens.dart';
import 'ui/ui.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final fx = Fixture.fromJson(jsonDecode(await rootBundle.loadString('assets/fixture.json')) as Map<String, dynamic>);
  runApp(BakeoffApp(fx: fx));
}

/// The bake-off shell: Halls, Search, You. Search has no content in this build and its tab is inert; You arrives with Task 12.
class BakeoffApp extends StatefulWidget {
  final Fixture fx;
  final List<String> pins;
  const BakeoffApp({super.key, required this.fx, this.pins = defaultPins});
  @override
  State<BakeoffApp> createState() => _BakeoffAppState();
}

class _BakeoffAppState extends State<BakeoffApp> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    return WidgetsApp(
      color: M2Color.dm,
      debugShowCheckedModeBanner: false,
      home: Builder(builder: (context) {
        final pad = MediaQuery.paddingOf(context);
        return ColoredBox(
          color: M2Color.chalk,
          child: Column(children: [
            Expanded(child: _tab == 0 ? HallsTab(fx: widget.fx, pins: widget.pins, top: pad.top) : const SizedBox.expand()),
            M2TabBar(selected: _tab, onSelect: (i) => setState(() => _tab = i), bottomInset: pad.bottom),
          ]),
        );
      }),
      pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(settings: settings, pageBuilder: (c, _, _) => builder(c)),
    );
  }
}
