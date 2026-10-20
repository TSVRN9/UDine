// Favourite alerts by push (brief flutter-port-alert-push, Task 6): the topic sync against a fake messaging client that records its calls,
// the three tap sources, and the Android manifest's auto-init key.
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/alerts/alerts.dart';
import 'package:udine/alerts/push.dart';
import 'package:udine/core/dish_topic.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/core/types.dart';

class FakeMessaging implements Messaging {
  final calls = <String>[];
  Object? failWith;
  String? failOnly; // a call name ('subscribe', 'unsubscribe', ...): only that call throws
  final opened = StreamController<PushNotice>.broadcast(), foreground = StreamController<PushNotice>.broadcast();
  PushNotice? initial;
  bool initialFails = false;

  Future<void> _do(String c) async {
    if (failWith != null && (failOnly == null || c.startsWith(failOnly!))) throw failWith!;
    calls.add(c);
  }

  @override
  Future<void> setAutoInit(bool on) => _do('autoInit:$on');
  @override
  Future<void> subscribe(String topic) => _do('sub:$topic');
  @override
  Future<void> unsubscribe(String topic) => _do('unsub:$topic');
  @override
  Future<void> deleteToken() => _do('deleteToken');
  @override
  Future<PushNotice?> initialMessage() async => initialFails ? throw StateError('no play services') : initial;
  @override
  Stream<PushNotice> get onOpened => opened.stream;
  @override
  Stream<PushNotice> get onForeground => foreground.stream;
}

Future<UdineStore> _store([List<String> favs = const []]) async {
  sqfliteFfiInit();
  final db = (await openStore(inMemoryDatabasePath, factory: databaseFactoryFfi)) as StoreReady;
  addTearDown(db.db.close);
  final s = UdineStore(db.db);
  for (final f in favs) {
    await s.addFavorite(DishFavorite(f));
  }
  return s;
}

void main() {
  final a = dishTopic('Pizza'), b = dishTopic('Tacos');

  test('never on: a sync makes no messaging call at all', () async {
    final m = FakeMessaging();
    await PushSync(await _store(['Pizza']), m).sync(on: false);
    expect(m.calls, isEmpty);
  });

  test('on: auto-init first, then one subscribe per favourite dish (not hall favourites); a second sync is silent', () async {
    final store = await _store(['Pizza', 'Tacos']), m = FakeMessaging(), p = PushSync(store, m);
    await store.addFavorite(const LocationFavorite(1));
    await p.sync(on: true);
    expect(m.calls, ['autoInit:true', 'sub:$a', 'sub:$b']..sort((x, y) => x.startsWith('autoInit') ? -1 : y.startsWith('autoInit') ? 1 : x.compareTo(y)));
    m.calls.clear();
    await p.sync(on: true);
    expect(m.calls, isEmpty);
  });

  test('the diff: an unfavourited dish is unsubscribed, a new one subscribed, the rest untouched', () async {
    final store = await _store(['Pizza']), m = FakeMessaging(), p = PushSync(store, m);
    await p.sync(on: true);
    m.calls.clear();
    await store.removeFavorite(const DishFavorite('Pizza'));
    await store.addFavorite(const DishFavorite('Tacos'));
    await p.sync(on: true);
    expect(m.calls, ['sub:$b', 'unsub:$a']);
  });

  test('a throw leaves the diff unapplied and the next sync retries it; Notify me on stays recorded', () async {
    final store = await _store(['Pizza']), m = FakeMessaging()..failWith = StateError('offline'), p = PushSync(store, m);
    await p.sync(on: true);
    expect(m.calls, isEmpty);
    m.failWith = null;
    await p.sync(on: true);
    expect(m.calls, ['autoInit:true', 'sub:$a']);
  });

  test('turning it off unsubscribes every topic, deletes the token, and then makes no further call', () async {
    final store = await _store(['Pizza', 'Tacos']), m = FakeMessaging(), p = PushSync(store, m);
    await p.sync(on: true);
    m.calls.clear();
    await p.sync(on: false);
    expect(m.calls.where((c) => c.startsWith('unsub:')).toSet(), {'unsub:$a', 'unsub:$b'});
    expect(m.calls.last, 'autoInit:false');
    expect(m.calls, contains('deleteToken'));
    m.calls.clear();
    await p.sync(on: false);
    expect(m.calls, isEmpty);
  });

  test('a failed subscribe is not recorded as applied, and the next sync retries it', () async {
    final store = await _store(['Pizza']), m = FakeMessaging(), p = PushSync(store, m);
    m..failWith = StateError('offline')..failOnly = 'sub:';
    await p.sync(on: true);
    expect(await store.pushTopics(), isEmpty);
    m.failWith = null;
    m.calls.clear();
    await p.sync(on: true);
    expect(m.calls, ['sub:$a']);
    expect(await store.pushTopics(), [a]);
  });

  test('a failed unsubscribe stays applied, and the next sync retries it', () async {
    final store = await _store(['Pizza']), m = FakeMessaging(), p = PushSync(store, m);
    await p.sync(on: true);
    await store.removeFavorite(const DishFavorite('Pizza'));
    m..failWith = StateError('offline')..failOnly = 'unsub:';
    await p.sync(on: true);
    expect(await store.pushTopics(), [a]);
    m.failWith = null;
    m.calls.clear();
    await p.sync(on: true);
    expect(m.calls, ['unsub:$a']);
    expect(await store.pushTopics(), isEmpty);
  });

  test('a messaging source that errors does not escape as an unhandled error', () async {
    final m = FakeMessaging()..initialFails = true;
    await runZonedGuarded(() async {
      await PushSync(await _store(['Pizza']), m).sync(on: true);
      m.opened.addError(StateError('x'));
      m.foreground.addError(StateError('y'));
      await Future<void>.delayed(Duration.zero);
    }, (e, _) => fail('unhandled: $e'));
  });

  test('off with a failing delete is retried next time', () async {
    final store = await _store(['Pizza']), m = FakeMessaging(), p = PushSync(store, m);
    await p.sync(on: true);
    m.calls.clear();
    m.failWith = StateError('no play services');
    await p.sync(on: false);
    m.failWith = null;
    await p.sync(on: false);
    expect(m.calls, ['unsub:$a', 'deleteToken', 'autoInit:false']);
  });

  test('the wanted set is capped at 2000 topics', () async {
    final store = await _store([for (var i = 0; i < 2100; i++) 'Dish $i']), m = FakeMessaging();
    await PushSync(store, m).sync(on: true);
    expect(m.calls.where((c) => c.startsWith('sub:')).length, 2000);
  });

  test('each tap source reaches alertTaps: the launching message, a backgrounded tap, and a foreground notification response', () async {
    final m = FakeMessaging()..initial = const PushNotice(title: 'Pizza', body: 'x', tag: 't', route: '/halls');
    final got = <String>[];
    final sub = alertTaps.stream.listen(got.add);
    await PushSync(await _store(['Pizza']), m).sync(on: true);
    m.opened.add(const PushNotice(title: 'Pizza', body: 'x', tag: 't', route: '/halls?b'));
    debugResponseForTest('/halls?c');
    await Future<void>.delayed(Duration.zero);
    expect(got, unorderedEquals(['/halls', '/halls?b', '/halls?c']));
    await sub.cancel();
  });

  test('a foreground message is shown, with its tag', () async {
    final m = FakeMessaging(), shown = <PushNotice>[];
    await PushSync(await _store(['Pizza']), m, show: (n) async => shown.add(n)).sync(on: true);
    m.foreground.add(const PushNotice(title: 'Pizza', body: 'Lunch', tag: 'dish-1-d', route: '/halls'));
    await Future<void>.delayed(Duration.zero);
    expect(shown.single.tag, 'dish-1-d');
  });

  test('the Android manifest keeps FCM auto-init off', () {
    final m = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
    expect(RegExp(r'android:name="firebase_messaging_auto_init_enabled"\s+android:value="false"').hasMatch(m), isTrue);
  });

  test('both packages are in the one google-services.json', () {
    final j = File('android/app/google-services.json').readAsStringSync();
    expect(j, contains('"package_name": "com.udinetogether.udine"'));
    expect(j, contains('"package_name": "com.udinetogether.udine.internal"'));
  });
}
