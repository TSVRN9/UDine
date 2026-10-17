import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/alerts/alerts.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';

// WorkManager runs the check in the app's own process while the UI may be open: closing the check's database must not close the app's.
void main() {
  sqfliteFfiInit();
  final f = databaseFactoryFfi;
  late Directory dir;
  late String path;
  setUp(() {
    dir = Directory.systemTemp.createTempSync('udine_alert_store');
    path = '${dir.path}/SQLite/udine.db';
  });
  tearDown(() => dir.deleteSync(recursive: true));

  test('the default open shares one handle per path: closing one closes the other (why the check must not use it)', () async {
    final app = (await openStore(path, factory: f) as StoreReady).db;
    final other = (await openStore(path, factory: f) as StoreReady).db;
    await other.close();
    await expectLater(() => app.rawQuery('SELECT 1'), throwsA(anything));
  });

  test('the check\'s connection is its own: closing it leaves the app\'s open, and the reverse', () async {
    final app = (await openStore(path, factory: f) as StoreReady).db;
    final bg = (await openAlertStore(path: path, factory: f) as StoreReady).db;
    expect(identical(app, bg), isFalse);
    await bg.close();
    expect(await app.rawQuery('SELECT 1'), isNotEmpty);
    final bg2 = (await openAlertStore(path: path, factory: f) as StoreReady).db;
    await app.close();
    expect(await bg2.rawQuery('SELECT 1'), isNotEmpty);
    await bg2.close();
  });

  test('both connections write the same file: a claim made in the check shows in the app, and is not claimed twice', () async {
    final app = UdineStore((await openStore(path, factory: f) as StoreReady).db);
    final bg = UdineStore((await openAlertStore(path: path, factory: f) as StoreReady).db);
    expect(await bg.claimAlert('Pizza', '2026-10-08'), isTrue);
    expect(await app.claimAlert('Pizza', '2026-10-08'), isFalse);
    expect(await app.alertsSent(), hasLength(1));
    await bg.db.close();
    await app.db.close();
  });
}
