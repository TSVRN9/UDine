@Timeout(Duration(seconds: 10))
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/alerts/alert_check.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';

import '../data/fixtures.dart';

// The background check reads through the repository, so it is offline-first like the app: saved copies answer when the network does not.
void main() {
  sqfliteFfiInit();
  late Database db;
  var online = true;
  final client = MockClient((req) async {
    if (!online) throw const SocketException('Network is unreachable');
    return http.Response.bytes(utf8.encode(req.url.path.endsWith('get_infov2') ? jsonEncode(locations()) : ajaxBody()), 200);
  });
  Repository make() => Repository(UmassSource(client), db, now: () => DateTime(2026, 10, 13, 12));

  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    online = true;
  });
  tearDown(() => db.close());

  test('today\'s hours and the four halls\' menus become a board', () async {
    final fx = (await loadAlertBoard(make(), '2026-10-13'))!;
    expect(fx.hours.keys, containsAll(['W', 'F', 'H', 'B']));
    expect(fx.days['2026-10-13']!.keys, ['W', 'F', 'H', 'B']);
    expect(fx.days['2026-10-13']!['W'], isNotEmpty);
  });

  test('offline it reads what the app saved; with nothing saved it is null', () async {
    online = false;
    expect(await loadAlertBoard(make(), '2026-10-13'), isNull);
    online = true;
    await loadAlertBoard(make(), '2026-10-13');
    online = false;
    final fx = (await loadAlertBoard(make(), '2026-10-13'))!;
    expect(fx.days['2026-10-13']!['W'], isNotEmpty);
  });
}
