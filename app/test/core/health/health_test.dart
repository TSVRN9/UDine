import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/health/health_client.dart';
import 'package:udine/core/health/health_meal.dart';
import 'package:udine/core/health/health_writer.dart';
import 'package:udine/core/m2/history.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/core/types.dart';

NutritionFacts facts({num cal = 200}) => NutritionFacts(
      servingSize: '1 cup', calories: cal, caloriesFromFat: 54, totalFatG: 6, satFatG: 1.5, transFatG: 0.5, cholesterolMg: 10, sodiumMg: 340,
      totalCarbG: 30, dietaryFiberG: 3, sugarsG: 4, proteinG: 9.5,
    );

LogEntry entry(String id, num servings, {num cal = 200}) => LogEntry(
      id: id, loggedAt: '2026-10-01T12:41:00.000', source: const UmassMenuSource(dishName: 'Pizza', hallTid: 1), servings: servings, nutrition: facts(cal: cal));

LoggedMeal meal(List<LogEntry> es) => LoggedMeal(es.first.loggedAt, '2026-10-01', [for (final e in es) LoggedItem(e)]);

class FakeHealth implements HealthClient {
  FakeHealth(this.platform);
  @override
  final String platform;
  final records = <String, HealthMeal>{};
  bool fail = false;
  @override
  Future<HealthAccess> access() async => HealthAccess.granted;
  @override
  Future<bool> requestWrite() async => true;
  @override
  Future<List<String>?> write(HealthMeal m) async {
    if (fail) return null;
    final ids = ['udine-${m.mealId}'];
    for (final id in ids) {
      records[id] = m;
    }
    return ids;
  }

  @override
  Future<bool> delete(List<String> ids) async {
    if (fail) return false;
    ids.forEach(records.remove);
    return true;
  }

  @override
  Future<void> openSettings() async {}
}

void main() {
  sqfliteFfiInit();
  late Directory dir;
  late UdineStore s;
  setUp(() async {
    dir = Directory.systemTemp.createTempSync('udine_health');
    s = UdineStore((await openStore('${dir.path}/SQLite/udine.db', factory: databaseFactoryFfi) as StoreReady).db);
  });
  tearDown(() => dir.deleteSync(recursive: true));

  group('mapping', () {
    test('a meal sums its rows by servings into the label fields, named by the caller, one minute long', () {
      final h = healthMealOf(meal([entry('a', 2), entry('b', 0.5, cal: 100)]), 'Lunch at Worcester');
      expect(h.mealId, '2026-10-01T12:41:00.000');
      expect(h.name, 'Lunch at Worcester');
      expect(h.start, DateTime(2026, 10, 1, 12, 41));
      expect(h.end, DateTime(2026, 10, 1, 12, 42));
      expect(h.fields, {
        'energyKcal': 450.0, 'fatG': 15.0, 'satFatG': 3.75, 'transFatG': 1.25, 'cholesterolMg': 25.0, 'sodiumMg': 850.0,
        'carbG': 75.0, 'fiberG': 7.5, 'sugarG': 10.0, 'proteinG': 23.75,
      });
    });

    test('the signature covers the time, the name and every nutrient the platform takes', () {
      final base = healthMealOf(meal([entry('a', 1)]), 'Lunch');
      String sig(HealthMeal h) => h.signature('android');
      expect(sig(healthMealOf(meal([entry('a', 1)]), 'Lunch')), sig(base));
      expect(sig(healthMealOf(meal([entry('a', 1)]), 'Dinner')), isNot(sig(base)));
      expect(sig(healthMealOf(meal([entry('a', 1, cal: 201)]), 'Lunch')), isNot(sig(base)));
      expect(sig(healthMealOf(meal([entry('a', 2)]), 'Lunch')), isNot(sig(base)));
      final other = LoggedMeal('2026-10-01T12:42:00.000', '2026-10-01', [LoggedItem(LogEntry(id: 'a', loggedAt: '2026-10-01T12:42:00.000', source: const UmassMenuSource(dishName: 'Pizza', hallTid: 1), servings: 1, nutrition: facts()))]);
      expect(sig(healthMealOf(other, 'Lunch')), isNot(sig(base)));
      expect(base.signature('ios'), isNot(base.signature('android'))); // (iOS has no trans fat)
    });

    test('HealthKit has no trans fat type: iOS drops it, Android keeps it', () {
      final h = healthMealOf(meal([entry('a', 1)]), 'Lunch');
      expect(h.fieldsFor('ios').containsKey('transFatG'), isFalse);
      expect(h.fieldsFor('ios').length, 9);
      expect(h.fieldsFor('android').length, 10);
    });
  });

  group('permissions are write only', () {
    test('the lists name only write grants and the dietary types', () {
      expect(kHealthWritePermissions['android'], ['android.permission.health.WRITE_NUTRITION']);
      expect(kHealthWritePermissions['ios']!, everyElement(startsWith('HKQuantityTypeIdentifierDietary')));
      expect(kHealthWritePermissions['ios']!.length, 9);
    });

    test('the manifest asks for WRITE_NUTRITION and no other health permission', () {
      final m = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
      final health = RegExp(r'uses-permission android:name="(android\.permission\.health\.[A-Z_]+)"').allMatches(m).map((x) => x[1]).toList();
      expect(health, ['android.permission.health.WRITE_NUTRITION']);
      expect(m, isNot(contains('health.READ')));
    });

    test('minSdk is not raised: Gradle keeps Flutter\'s, and the manifest overrides the Health Connect library', () {
      final g = File('android/app/build.gradle.kts').readAsStringSync();
      expect(g, contains('minSdk = flutter.minSdkVersion'));
      expect(g, isNot(contains('maxOf(')));
      final m = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
      expect(m, contains('xmlns:tools="http://schemas.android.com/tools"'));
      expect(m, contains('<uses-sdk tools:overrideLibrary="androidx.health.connect.client"/>'));
      final k = File('android/app/src/main/kotlin/com/udinetogether/udine/MainActivity.kt').readAsStringSync();
      expect(k, contains('Build.VERSION.SDK_INT < 26'));
    });

    test('Open Health Connect uses the home action an app may start, not the protected MANAGE_HEALTH_PERMISSIONS', () {
      final k = File('android/app/src/main/kotlin/com/udinetogether/udine/MainActivity.kt').readAsStringSync();
      expect(k, contains('android.health.connect.action.HEALTH_HOME_SETTINGS'));
      expect(k, isNot(contains('"android.health.connect.action.MANAGE_HEALTH_PERMISSIONS"')));
    });

    test('Health Connect\'s "privacy policy" link opens the published policy, not the app', () {
      final m = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
      String block(String open, String close) => m.substring(m.indexOf(open), m.indexOf(close, m.indexOf(open)));
      final main = block('android:name=".MainActivity"', '</activity>'), privacy = block('android:name=".PrivacyActivity"', '</activity>');
      expect(main, isNot(contains('PERMISSIONS_RATIONALE')));
      expect(privacy, contains('androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE'));
      expect(m, contains('android:targetActivity=".PrivacyActivity"'));
      expect(m, isNot(contains('android:targetActivity=".MainActivity"')));
      final k = File('android/app/src/main/kotlin/com/udinetogether/udine/PrivacyActivity.kt').readAsStringSync();
      expect(k, contains('"https://owenwang.dev/UDine/"'));
      expect(k, contains('Intent.ACTION_VIEW'));
      expect(k, contains('catch (e: ActivityNotFoundException)'));
      expect(k.indexOf('catch'), lessThan(k.indexOf('finish()')));
      expect(m, isNot(contains('android:scheme="https"'))); // (nothing resolves or canLaunch-es a URL, so no <queries> entry)
      expect(m, isNot(contains('android:scheme="market"')));
    });

    test('iOS: HealthKit entitlement and the update string, no share (read) string', () {
      final plist = File('ios/Runner/Info.plist').readAsStringSync();
      expect(plist, contains('NSHealthUpdateUsageDescription'));
      expect(plist, isNot(contains('NSHealthShareUsageDescription')));
      final ent = File('ios/Runner/Runner.entitlements').readAsStringSync();
      expect(ent, contains('com.apple.developer.healthkit'));
      expect(ent, isNot(contains('health-records')));
    });
  });

  group('ChannelHealthClient payload', () {
  const ch = MethodChannel('udine/health');
  final calls = <MethodCall>[];
  Object? reply;
  setUp(() {
    calls.clear();
    reply = ['udine-x'];
    TestWidgetsFlutterBinding.ensureInitialized();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(ch, (c) async {
      calls.add(c);
      return reply;
    });
  });
  tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(ch, null));

  test('write sends the udine-<mealId> client id, the zone offset, the platform\'s fields and nothing the native side does not read', () async {
    final h = healthMealOf(meal([entry('a', 1)]), 'Lunch');
    final ids = await ChannelHealthClient(channel: ch, platform: 'ios').write(h);
    expect(ids, ['udine-x']);
    final a = calls.single.arguments as Map;
    expect(calls.single.method, 'write');
    expect(a['clientId'], 'udine-2026-10-01T12:41:00.000');
    expect(a['name'], 'Lunch');
    expect(a['startMs'], h.start.millisecondsSinceEpoch);
    expect(a['endMs'], h.start.millisecondsSinceEpoch + 60000);
    expect(a['zoneOffsetSeconds'], h.start.timeZoneOffset.inSeconds);
    expect(a['fields'], h.fieldsFor('ios'));
    expect((a['fields'] as Map).containsKey('transFatG'), isFalse);
    expect(a.keys.toSet(), {'clientId', 'name', 'startMs', 'endMs', 'zoneOffsetSeconds', 'fields'});
    await ChannelHealthClient(channel: ch, platform: 'android').write(h);
    expect((calls.last.arguments as Map)['fields'], h.fieldsFor('android'));
  });

  test('requests and access carry the platform\'s write permissions only; delete carries the ids', () async {
    reply = true;
    await ChannelHealthClient(channel: ch, platform: 'android').requestWrite();
    expect(calls.last.arguments, {'permissions': ['android.permission.health.WRITE_NUTRITION']});
    reply = 'granted';
    expect(await ChannelHealthClient(channel: ch, platform: 'ios').access(), HealthAccess.granted);
    expect((calls.last.arguments as Map)['permissions'], kHealthWritePermissions['ios']);
    reply = true;
    await ChannelHealthClient(channel: ch, platform: 'ios').delete(['a', 'b']);
    expect(calls.last.method, 'delete');
    expect((calls.last.arguments as Map)['ids'], ['a', 'b']);
  });
});

  for (final platform in ['android', 'ios']) {
  group('writer on $platform', () {
      late FakeHealth fake;
      late HealthWriter w;
      setUp(() {
        fake = FakeHealth(platform);
        w = HealthWriter(s, fake);
      });
      HealthMeal m(num cal) => healthMealOf(meal([entry('a', 1, cal: cal)]), 'Lunch');

      test('logging writes one record and keeps its ids; editing rewrites it; deleting deletes it; Undo writes it back', () async {
        expect(await w.write(m(200)), isTrue);
        expect(fake.records.length, 1);
        expect(fake.records.values.single.fields['energyKcal'], 200);
        final ids = (await s.healthWrites()).single;
        expect((ids.mealId, ids.platform), ('2026-10-01T12:41:00.000', platform));
        expect(ids.recordIds, fake.records.keys.toList());

        expect(await w.write(m(300)), isTrue);
        expect(fake.records.length, 1);
        expect(fake.records.values.single.fields['energyKcal'], 300);
        expect((await s.healthWrites()).length, 1);

        expect(await w.delete('2026-10-01T12:41:00.000'), isTrue);
        expect(fake.records, isEmpty);
        expect(await s.healthWrites(), isEmpty);

        expect(await w.write(m(300)), isTrue);
        expect(fake.records.length, 1);
      });

      test('a failed write changes nothing; a failed delete keeps the ids to retry', () async {
        fake.fail = true;
        expect(await w.write(m(200)), isFalse);
        expect(await s.healthWrites(), isEmpty);
        fake.fail = false;
        await w.write(m(200));
        fake.fail = true;
        expect(await w.delete('2026-10-01T12:41:00.000'), isFalse);
        expect((await s.healthWrites()).length, 1);
        expect(fake.records.length, 1);
      });

      test('a row holding no record ids is removed by a delete, and Health is not asked', () async {
        await s.setHealthIds('2026-10-01T12:41:00.000', platform, const []);
        fake.fail = true; // (a call to Health would fail)
        expect(await w.delete('2026-10-01T12:41:00.000'), isTrue);
        expect(await s.healthWrites(), isEmpty);
      });

      test('deleting a meal never written is a no-op that succeeds', () async {
        expect(await w.delete('nope'), isTrue);
      });
    });
  }

  test('health_writes is exported as udine-health-writes.json and .csv', () async {
    await s.setHealthIds('2026-10-01T12:41:00.000', 'android', ['udine-2026-10-01T12:41:00.000']);
    await s.setHealthIds('=m,2', 'ios', ['u1', 'u2'], '123|Lunch|energyKcal=200.0');
    final j = (await s.exportJson())['udine-health-writes.json']!;
    expect(jsonDecode(j), [
      {'mealId': '2026-10-01T12:41:00.000', 'platform': 'android', 'recordIds': ['udine-2026-10-01T12:41:00.000'], 'contentSig': null},
      {'mealId': '=m,2', 'platform': 'ios', 'recordIds': ['u1', 'u2'], 'contentSig': '123|Lunch|energyKcal=200.0'},
    ]);
    expect((await s.exportCsv())['udine-health-writes.csv']!.split('\n'), [
      'mealId,platform,recordIds,contentSig',
      '"2026-10-01T12:41:00.000","android","udine-2026-10-01T12:41:00.000"',
      '"\t=m,2","ios","u1 u2"',
    ]);
  });
}
