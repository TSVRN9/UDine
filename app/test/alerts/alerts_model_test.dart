// Notify me (M2 R11 §2): what a tap, the OS's answer and a return to the app do to the switch. The OS is a fake that answers as a
// real one does (a blocked app's request answers false at once).
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/shell/alerts_model.dart';
import 'fake_os.dart';

Future<UdineStore> _store() async {
  sqfliteFfiInit();
  final db = (await openStore(inMemoryDatabasePath, factory: databaseFactoryFfi)) as StoreReady;
  addTearDown(db.db.close);
  return UdineStore(db.db);
}

void main() {
  test('off: a tap raises the OS sheet; allowed fills the check and keeps it', () async {
    final os = FakeAlertsOs(), store = await _store(), m = await AlertsModel.load(store, os);
    expect((m.checked, m.denied), (false, false));
    await m.toggle();
    expect(os.requests, 1);
    expect((m.checked, m.denied), (true, false));
    expect(await store.alertsOn(), isTrue);
  });

  test('denied: the check stays empty, the state is denied, nothing is kept; Open Settings asks for the notification page', () async {
    final os = FakeAlertsOs(willAllow: false), store = await _store(), m = await AlertsModel.load(store, os);
    await m.toggle();
    expect((m.checked, m.denied), (false, true));
    expect(await store.alertsOn(), isFalse);
    await m.openSettings();
    expect(os.opened, 1);
  });

  test('blocked: the OS answers at once, without a sheet, and the tap goes straight to denied (every tap)', () async {
    final os = FakeAlertsOs(willAllow: false), m = await AlertsModel.load(await _store(), os);
    await m.toggle();
    await m.toggle();
    expect(os.requests, 2);
    expect((m.checked, m.denied), (false, true));
  });

  test('revoked: stored on, no longer allowed, found when the app is shown again; allowing it again in settings finds it checked', () async {
    final os = FakeAlertsOs(), store = await _store();
    await store.setAlertsOn(true);
    os.permitted = true;
    final m = await AlertsModel.load(store, os);
    expect(m.checked, isTrue);
    os.permitted = false;
    await m.refresh();
    expect((m.checked, m.denied), (false, true));
    expect(await store.alertsOn(), isTrue, reason: 'the wish is kept');
    os.permitted = true;
    await m.refresh();
    expect((m.checked, m.denied), (true, false));
  });

  test('a refresh that changes nothing tells nobody', () async {
    final m = await AlertsModel.load(await _store(), FakeAlertsOs());
    var n = 0;
    m.addListener(() => n++);
    await m.refresh();
    expect(n, 0);
  });

  test('on: a tap turns it off, and keeps nothing', () async {
    final os = FakeAlertsOs(), store = await _store(), m = await AlertsModel.load(store, os);
    await m.toggle();
    await m.toggle();
    expect(m.checked, isFalse);
    expect(await store.alertsOn(), isFalse);
    expect(os.requests, 1, reason: 'turning off never asks the OS');
  });

  test('it loads as stored, so the row does not pop in', () async {
    final store = await _store();
    await store.setAlertsOn(true);
    expect((await AlertsModel.load(store, FakeAlertsOs(permitted: true))).checked, isTrue);
  });

  test('with no store (a newer build owns the database) the wish lives in memory', () async {
    final m = await AlertsModel.load(null, FakeAlertsOs());
    await m.toggle();
    expect(m.checked, isTrue);
  });
}
