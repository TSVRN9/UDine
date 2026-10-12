import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'logic/fixture.dart';
import 'screens/halls.dart';
import 'shell.dart';
import 'state/seed.dart';
import 'state/store.dart';
import 'theme/tokens.dart';

/// `--dart-define=BAKEOFF_SEED=plate=W:lunch:...&scores=health` seeds the store for recordings (see state/seed.dart).
const _seed = String.fromEnvironment('BAKEOFF_SEED');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final fx = Fixture.fromJson(jsonDecode(await rootBundle.loadString('assets/fixture.json')) as Map<String, dynamic>);
  final store = Store(fx);
  await store.hydrate(); // what the device kept lands before the first frame: no pop-in
  if (_seed.isNotEmpty) applySeed(store, fx, _seed);
  runApp(BakeoffApp(fx: fx, store: store));
}

/// The bake-off app: Halls, Search, You. Search has no content in this build and its tab is inert.
class BakeoffApp extends StatefulWidget {
  final Fixture fx;
  final List<String> pins;
  final Store? store;
  const BakeoffApp({super.key, required this.fx, this.pins = defaultPins, this.store});
  @override
  State<BakeoffApp> createState() => _BakeoffAppState();
}

class _BakeoffAppState extends State<BakeoffApp> {
  late final Store _store = widget.store ?? Store(widget.fx);

  @override
  Widget build(BuildContext context) {
    return StoreScope(
      store: _store,
      child: WidgetsApp(
        color: M2Color.dm,
        debugShowCheckedModeBanner: false,
        home: Shell(fx: widget.fx, pins: widget.pins, store: _store),
        pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(settings: settings, pageBuilder: (c, _, _) => builder(c)),
      ),
    );
  }
}
