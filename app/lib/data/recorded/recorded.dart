import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:sqflite/sqflite.dart';

import '../../theme/m2_tokens.g.dart';
import '../repository.dart';
import '../source.dart';
import 'flags.dart';
import 'recorded_client.dart';

export 'flags.dart';

/// M2's net.slow token (1600 ms).
final defaultSlow = Duration(milliseconds: M2Motion.netSlow.round());

const _bundled = 'assets/recorded/'; // internal flavor only (pubspec.yaml)
Future<String> _fromBundle(String name) => rootBundle.loadString('$_bundled$name');

/// The same Repository the live app uses, with M2's recordings behind the HTTP seam and [RecordedFlags] applied:
/// `at` replaces the clock, `net` the network. Offline first warms the cache once online (the repository's own launch),
/// then drops the network, so today and tomorrow are saved and every other day is not.
/// [read] loads a recording by file name (the bundled asset by default). [slow] overrides the slow delay for tests.
Future<Repository> recordedRepository(RecordedFlags f, Database db, {Future<String> Function(String name) read = _fromBundle, Duration? slow}) async {
  final client = RecordedClient(
    menus: jsonDecode(await read('menus-2026-10-08-to-22.json')) as Map<String, dynamic>,
    locations: await read('locations-2026-10-11.json'),
    events: await read('events-raw.json'),
  );
  final net = NetClient(client, f.net == NetMode.offline ? NetMode.ok : f.net, slow ?? defaultSlow);
  final at = f.at;
  final repo = Repository(UmassSource(net), db, now: at == null ? null : () => at);
  if (f.net == NetMode.offline) {
    await repo.launch();
    net.mode = NetMode.offline;
  }
  return repo;
}
