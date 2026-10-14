import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/occupancy.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';
import 'package:udine/data/supabase_source.dart';

import 'fixtures.dart';

Map<String, dynamic> nutrition(num cal) => {
  'servingSize': '1 each', 'calories': cal, 'caloriesFromFat': 0, 'totalFatG': 0, 'satFatG': 0, 'transFatG': 0,
  'cholesterolMg': 0, 'sodiumMg': 0, 'totalCarbG': 0, 'dietaryFiberG': 0, 'sugarsG': 0, 'proteinG': 1,
};

/// 2500 dishes d0000.., updated_at = base + i seconds, so a delta is easy to predict.
Map<String, dynamic> dish(int i, {int cal = 100}) => {
  'dish_name': 'd${i.toString().padLeft(4, '0')}',
  'nutrition': nutrition(cal),
  'allergens': <String>[],
  'diet_tags': ['vegan'],
  'updated_at': DateTime.utc(2026, 10, 1, 0, 0, i).toIso8601String().replaceFirst('.000Z', '+00:00'),
};

class Fake {
  bool online = true;
  bool rpcFails = false;
  final dishes = [for (var i = 0; i < 2500; i++) dish(i)];
  final calls = <Uri>[];
  final bodies = <String>[];

  late final client = MockClient((req) async {
    calls.add(req.url);
    bodies.add(req.body);
    if (!online) throw const SocketException('Network is unreachable');
    expect(req.headers['apikey'], supabasePublishableKey);
    switch (req.url.path) {
      case '/rest/v1/dishes':
        final q = req.url.queryParameters;
        expect(q['order'], 'dish_name');
        expect(q['select'], 'dish_name,nutrition,allergens,diet_tags,updated_at');
        final since = q['updated_at'];
        var rows = dishes.where((d) => since == null || DateTime.parse(d['updated_at'] as String).isAfter(DateTime.parse(since.substring(3)))).toList();
        final off = int.parse(q['offset']!);
        rows = rows.skip(off).take(int.parse(q['limit']!)).toList();
        return http.Response(jsonEncode(rows), 200);
      case '/rest/v1/rpc/occupancy_typical':
        if (rpcFails) return http.Response('boom', 500);
        return http.Response(jsonEncode(curve), 200);
    }
    throw StateError('unexpected ${req.url}');
  });

  // Level 2 until 13:00, then 1, then 0 from 14:00. Six samples everywhere.
  List<Map<String, dynamic>> curve = [
    for (var m = 11 * 60; m < 16 * 60; m += 15)
      {
        'bucket_start': '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}:00',
        'median_headcount': m < 13 * 60 ? 600 : m < 14 * 60 ? 400 : 100,
        'median_level': m < 13 * 60 ? 2 : m < 14 * 60 ? 1 : 0,
        'samples': 6,
      },
  ];
}

void main() {
  sqfliteFfiInit();
  late Database db;
  late Fake net;
  var clock = DateTime.utc(2026, 10, 13, 16); // Tuesday 12:00 Eastern: dow 2
  late Repository repo;

  Repository make() => Repository(UmassSource(MockClient((_) async => http.Response('[]', 200))), db, now: () => clock, supabase: SupabaseSource(net.client));

  HoursData hoursWithBusy(int count) {
    final list = locations();
    final w = (list.firstWhere((l) => l['location_title'] == 'Worcester Commons') as Map<String, dynamic>)..['business_level'] = count;
    return HoursData(
      mapInfoV2([for (final l in list) l as Map<String, dynamic>]),
      {'Worcester Commons': SensorLevels(count: count, notBusy: w['notbusy_level'] as int, moderate: w['moderate_level'] as int)},
      {'Worcester Commons': 1},
    );
  }

  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    net = Fake();
    clock = DateTime.utc(2026, 10, 13, 16);
    repo = make();
  });
  tearDown(() => db.close());

  group('dish catalog', () {
    test('pages by 1000 in dish_name order until a short page', () async {
      final got = await repo.dishCatalog().toList();
      expect(got.map((s) => s.runtimeType.toString().split('<').first), ['Loading', 'Loaded']);
      final rows = (got.last as Loaded<List<DishCatalogEntry>>).value;
      expect(rows, hasLength(2500));
      expect(rows.first.dishName, 'd0000');
      expect(rows.first.dietTags, ['vegan']);
      expect(net.calls.map((u) => u.queryParameters['offset']), ['0', '1000', '2000']);
      expect(net.calls.every((u) => !u.queryParameters.containsKey('updated_at')), isTrue);
    });

    test('a later day resumes from the newest updated_at held and merges changed rows', () async {
      await repo.dishCatalog().drain<void>();
      net.calls.clear();
      clock = clock.add(const Duration(days: 1));
      net.dishes[5] = {...dish(5, cal: 999), 'updated_at': '2026-10-13T00:00:00+00:00'};
      net.dishes.add(dish(2500)..['updated_at'] = '2026-10-13T00:00:01+00:00');
      final got = await repo.dishCatalog().toList();
      final rows = (got.last as Loaded<List<DishCatalogEntry>>).value;
      expect(net.calls, hasLength(1));
      expect(net.calls.single.queryParameters['updated_at'], 'gt.2026-10-01T00:41:39+00:00');
      expect(rows, hasLength(2501));
      expect(rows.firstWhere((r) => r.dishName == 'd0005').nutrition.calories, 999);
    });

    test('the same day asks for nothing', () async {
      await repo.dishCatalog().drain<void>();
      net.calls.clear();
      final got = await repo.dishCatalog().toList();
      expect(got, hasLength(1));
      expect((got.single as Loaded<List<DishCatalogEntry>>).value, hasLength(2500));
      expect(net.calls, isEmpty);
    });

    test('offline: the saved catalog, or NotSaved', () async {
      net.online = false;
      expect((await repo.dishCatalog().toList()).last, isA<NotSaved<List<DishCatalogEntry>>>());
      net.online = true;
      await repo.dishCatalog().drain<void>();
      net.online = false;
      clock = clock.add(const Duration(days: 1));
      expect((await repo.dishCatalog().toList()).last, isA<LoadedOffline<List<DishCatalogEntry>>>());
    });
  });

  group('busy', () {
    test('curve + live busy through occupancyRead; the RPC gets the location and Eastern weekday', () async {
      final reads = await repo.busyReads(hoursWithBusy(800));
      final r = reads['Worcester Commons']!;
      expect(r.level, 2);
      expect(r.confidence, Confidence.good);
      expect(r.calmerAt, '13:00');
      expect(jsonDecode(net.bodies.single), {'p_location_id': 1, 'p_dow': 2});
    });

    test('the curve is cached per (location, dow) for the day; busy is recomputed from the live reading each time', () async {
      await repo.busyReads(hoursWithBusy(800));
      net.calls.clear();
      expect((await repo.busyReads(hoursWithBusy(10)))['Worcester Commons']!.level, 0);
      expect(net.calls, isEmpty);
      clock = clock.add(const Duration(days: 7)); // same dow, next day: refetched
      await repo.busyReads(hoursWithBusy(800));
      expect(net.calls, hasLength(1));
      clock = clock.add(const Duration(days: 1)); // different dow: its own entry
      await repo.busyReads(hoursWithBusy(800));
      expect(net.calls, hasLength(2));
      expect(await db.query('preferences_kv', where: "key LIKE 'occupancy:v1:%'"), hasLength(2));
    });

    test('offline: yesterday-or-older curve still answers; busy absent when there is no live reading', () async {
      await repo.busyReads(hoursWithBusy(800));
      net.online = false;
      clock = clock.add(const Duration(days: 7));
      expect((await repo.busyReads(hoursWithBusy(800)))['Worcester Commons']!.calmerAt, '13:00');
      expect(await repo.busyReads(HoursData(mapInfoV2([for (final l in locations()) l as Map<String, dynamic>]), null, {})), isEmpty);
    });

    test('RPC failure: level only, no calmerAt, no error', () async {
      net.rpcFails = true;
      final r = (await repo.busyReads(hoursWithBusy(800)))['Worcester Commons']!;
      expect(r.level, 2);
      expect(r.calmerAt, isNull);
      expect(r.confidence, Confidence.low);
    });

    test('unreachable and nothing saved: level only', () async {
      net.online = false;
      final r = (await repo.busyReads(hoursWithBusy(800)))['Worcester Commons']!;
      expect((r.level, r.calmerAt), (2, null));
    });
  });
}
