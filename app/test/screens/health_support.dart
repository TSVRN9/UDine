import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/data/recorded/flags.dart';
import 'package:udine/data/recorded/simulated_health.dart';
import 'support.dart';

/// Opens the book on the simulated OS, as a recorded route's `?os=&health=` does. After any history is in the log: what is logged before
/// the book opens is never written. Returns the OS the row talks to.
Future<SimulatedHealth> bootHealth(WidgetTester t, Boot b, {String health = 'allow', String os = 'android'}) async {
  await t.runAsync(() => b.openHealth(RecordedFlags(at: lunch, health: health, os: os)));
  return b.health!.client as SimulatedHealth;
}
