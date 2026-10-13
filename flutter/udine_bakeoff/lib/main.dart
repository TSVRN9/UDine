import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'logic/fixture.dart';
import 'logic/net.dart';
import 'screens/halls.dart';
import 'shell.dart';
import 'state/net.dart';
import 'state/seed.dart';
import 'state/store.dart';
import 'theme/tokens.dart';

/// `--dart-define=BAKEOFF_SEED=plate=W:lunch:...&scores=health` seeds the store for recordings (see state/seed.dart).
const _seed = String.fromEnvironment('BAKEOFF_SEED');

/// `--dart-define=BAKEOFF_NET=slow|offline|fail` is M2's `?net=` (see logic/net.dart).
const _netMode = String.fromEnvironment('BAKEOFF_NET');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final fx = Fixture.fromJson(
    jsonDecode(await rootBundle.loadString('assets/fixture.json'))
        as Map<String, dynamic>,
  );
  final store = Store(fx);
  await store
      .hydrate(); // what the device kept lands before the first frame: no pop-in
  if (_seed.isNotEmpty) applySeed(store, fx, _seed);
  runApp(
    BakeoffApp(
      fx: fx,
      store: store,
      net: Net(fx, mode: parseNet(_netMode)),
    ),
  );
}

/// The bake-off app: Halls, Search, You. Search has no content in this build and its tab is inert.
class BakeoffApp extends StatefulWidget {
  final Fixture fx;
  final List<String> pins;
  final Store? store;
  final Net? net;
  const BakeoffApp({
    super.key,
    required this.fx,
    this.pins = defaultPins,
    this.store,
    this.net,
  });
  @override
  State<BakeoffApp> createState() => _BakeoffAppState();
}

class _BakeoffAppState extends State<BakeoffApp> {
  late final Store _store = widget.store ?? Store(widget.fx);
  late final Net _net = widget.net ?? Net(widget.fx);

  @override
  Widget build(BuildContext context) {
    return StoreScope(
      store: _store,
      child: NetScope(
        net: _net,
        child: WidgetsApp(
          color: M2Color.dm,
          debugShowCheckedModeBanner: false,
          home: Shell(fx: widget.fx, pins: widget.pins, store: _store),
          pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(
            settings: settings,
            pageBuilder: (c, _, _) => builder(c),
          ),
        ),
      ),
    );
  }
}
