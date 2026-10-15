import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/content.dart';
import 'package:udine/core/occupancy.dart';
import 'package:udine/core/types.dart';
import 'package:udine/core/m2/plate.dart';
import 'package:udine/core/m2/status.dart';
import 'package:udine/core/foodpro.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'package:udine/data/recorded/recorded_client.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/theme/m2_tokens.g.dart';

const _flows = '../docs/design/explorations/2026-10-ui-overhaul/flows';
Future<String> _read(String name) async => File('$_flows/$name').readAsStringSync();

String kinds<T>(List<DataState<T>> l) => l.map((s) => s.runtimeType.toString().split('<').first).join(',');

void main() {
  sqfliteFfiInit();
  late Database db;
  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
  });
  tearDown(() => db.close());

  Future<Repository> repo(String route, {Duration? slow}) async {
    final f = recordedFlags(route)!;
    return recordedRepository(f, db, read: _read, slow: slow);
  }

  group('flags', () {
    test('data=recorded with at and net', () {
      final f = recordedFlags('/hall/worcester?data=recorded&at=2026-10-08T12:41&net=slow')!;
      expect(f.at, DateTime(2026, 10, 8, 12, 41));
      expect(f.net, NetMode.slow);
    });
    test('defaults: net ok, clock unset', () {
      final f = recordedFlags('/?data=recorded')!;
      expect((f.at, f.net), (null, NetMode.ok));
    });
    test('scores=health,carbon turns the You score switches on for a capture', () {
      expect(recordedFlags('/?data=recorded&scores=health,carbon')!.scores, (health: true, carbon: true));
      expect(recordedFlags('/?data=recorded&scores=carbon')!.scores, (health: false, carbon: true));
      expect(recordedFlags('/?data=recorded')!.scores, (health: false, carbon: false));
    });
    test('avoid=Milk,Eggs and only=Halal set the Avoid list and "Only show" tags for a capture', () {
      final f = recordedFlags('/?data=recorded&avoid=Milk,Eggs&only=Halal')!;
      expect(f.avoid, ['Milk', 'Eggs']);
      expect(f.onlyShow, ['Halal']);
      expect(recordedFlags('/?data=recorded')!.avoid, isEmpty);
    });
    test('no data flag, no switch', () => expect(recordedFlags('/hall/worcester?net=fail'), isNull));
  });

  group('photos=off', () {
    test('the flag turns photos off, wherever it sits in the query', () {
      expect(photosOff('/halls?photos=off'), isTrue);
      expect(photosOff('/halls?data=recorded&photos=off&at=2026-10-08T12:41'), isTrue);
      expect(photosOff('/halls?data=recorded'), isFalse);
      expect(photosOff('/halls?photos=on'), isFalse);
    });
    test('a release build cannot reach it', () => expect(photosOff('/halls?photos=off', available: false), isFalse));
  });

  group('release guard', () {
    test('the gate is const and tracks kReleaseMode', () {
      expect(recordedAvailable, !kReleaseMode);
    });
    test('an unavailable gate returns no flags even for a recorded route', () {
      expect(recordedFlags('/?data=recorded', available: false), isNull);
    });
    test('pubspec bundles the recorded assets for the internal flavor only', () {
      final y = File('pubspec.yaml').readAsStringSync();
      expect(RegExp(r'- path: assets/recorded/\n\s+flavors:\n\s+- internal\n').hasMatch(y), isTrue);
      expect(RegExp(r'^\s+- assets/recorded', multiLine: true).hasMatch(y), isFalse);
    });
    test('the PDFs are internal-flavor only, and gitignored', () {
      expect(RegExp(r'- path: assets/recorded/pdf/\n\s+flavors:\n\s+- internal\n').hasMatch(File('pubspec.yaml').readAsStringSync()), isTrue);
      expect(File('.gitignore').readAsStringSync(), contains('/assets/recorded/pdf/*'));
    });
  });

  group('same repository, recorded source', () {
    test('Worcester lunch Oct 8: benchmark dishes and the 404 cal plate', () async {
      final r = await repo('/?data=recorded&at=2026-10-08T12:41');
      final got = await r.menu(1, '2026-10-08').toList();
      expect(kinds(got), 'Loading,Loaded');
      final lunch = (got.last as Loaded<List<MenuItem>>).value.where((i) => i.mealPeriod.name == 'lunch').toList();
      final names = lunch.map((i) => i.dishName).toList();
      expect(names, containsAll(['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh']));
      var s = emptyPlates;
      for (final n in ['Beef Brisket Noodle Bowl', 'Golden BBQ Chicken Thigh', 'Golden BBQ Chicken Thigh']) {
        s = addDish(s, 'lunch', n, {'W': lunch.firstWhere((i) => i.dishName == n)});
      }
      final t = totals(s.plates[0]);
      expect((t.cal, double.parse(t.p.toStringAsFixed(1))), (404, 38.9));
    });

    test('a café is served by its location id; hours carry busy', () async {
      final r = await repo('/?data=recorded&at=2026-10-08T12:41');
      final h = (await r.hours('2026-10-08').toList()).last as Loaded<HoursData>;
      expect(h.value.busy, isNotEmpty);
      expect(h.value.feed.retail, isNotEmpty);
      final e = (await r.events().toList()).last as Loaded<List<DiningEvent>>;
      expect(e.value, isNotEmpty);
    });

    test("a café's description (short_description_v2) is in recorded mode", () async {
      final r = await repo('/?data=recorded&at=2026-10-08T12:41');
      final h = (await r.hours('2026-10-08').toList()).last as Loaded<HoursData>;
      final peoples = h.value.feed.retail.firstWhere((l) => l.name.startsWith("People"));
      expect(peoples.description, contains('Campus Center'));
    });

    test('the fixed clock drives open status', () async {
      final noon = await repo('/?data=recorded&at=2026-10-08T12:41');
      final early = await repo('/?data=recorded&at=2026-10-08T06:00');
      Future<String> status(Repository r) async {
        final h = (await r.hours(r.today).toList()).last as Loaded<HoursData>;
        return statusText(h.value.feed.halls.firstWhere((x) => x.hallTid == 1), r.now());
      }

      expect(await status(noon), 'Open until midnight');
      expect(await status(early), 'Opens 7 AM');
    });
  });

  group('net flags', () {
    test('ok: Loading, Loaded', () async {
      expect(kinds(await (await repo('/?data=recorded')).menu(1, '2026-10-08').toList()), 'Loading,Loaded');
    });
    test('slow: waits the net.slow token, StillLoading shows before Loaded', () async {
      expect(M2Motion.netSlow, 1600);
      final r = await repo('/?data=recorded&net=slow', slow: const Duration(milliseconds: 600));
      final sw = Stopwatch()..start();
      final got = await r.menu(1, '2026-10-08').toList();
      expect(kinds(got), 'Loading,StillLoading,Loaded');
      expect(sw.elapsedMilliseconds, greaterThanOrEqualTo(590));
    });
    test('default slow is M2 net.slow', () async {
      expect(defaultSlow, const Duration(milliseconds: 1600));
    });
    test('offline: today and tomorrow come from the cache, other days are not saved', () async {
      final r = await repo('/?data=recorded&net=offline&at=2026-10-08T12:41');
      expect(kinds(await r.menu(1, '2026-10-08').toList()), 'Loaded');
      expect(kinds(await r.menu(1, '2026-10-09').toList()), 'Loaded');
      expect(kinds(await r.menu(1, '2026-10-12').toList()), 'Loading,NotSaved');
    });
    test('fail: Failed', () async {
      final r = await repo('/?data=recorded&net=fail');
      expect(kinds(await r.menu(1, '2026-10-08').toList()), 'Loading,Failed');
    });
  });

  group('every dish round-trips raw JSON -> feed HTML -> MenuItem', () {
    final dishes = ((jsonDecode(File('$_flows/menus-2026-10-08-to-22.json').readAsStringSync()) as Map)['dishes'] as List).cast<Map<String, dynamic>>();

    num n(String? s) {
      final m = RegExp(r'-?\d+(\.\d+)?').firstMatch(s ?? '');
      return m == null ? 0 : double.parse(m[0]!);
    }

    List<String> csv(String s) => [for (final x in s.split(',').map((x) => x.trim())) if (x.isNotEmpty) x];
    Dv? dv(Map<String, dynamic> d, String k) => d.containsKey(k) ? Dv((d[k] as String).isEmpty ? null : n(d[k] as String)) : null;

    MenuItem parsed(Map<String, dynamic> d) =>
        parseCategoryItems(RecordedClient.anchor(d), 'Station', MealPeriod.lunch, 1, '2026-10-08').single;

    void check(Map<String, dynamic> d) {
      final i = parsed(d), x = i.nutrition;
      final code = (d['recipe-webcode'] as String).split(RegExp(r'\s+'));
      final grade = code.where(RegExp(r'^H[0-7]$').hasMatch).map((c) => int.parse(c[1])).firstOrNull;
      const nut = {
        'calories': 'calories', 'calories-from-fat': 'caloriesFromFat', 'total-fat': 'totalFatG', 'sat-fat': 'satFatG',
        'trans-fat': 'transFatG', 'cholesterol': 'cholesterolMg', 'sodium': 'sodiumMg', 'total-carb': 'totalCarbG',
        'dietary-fiber': 'dietaryFiberG', 'sugars': 'sugarsG', 'protein': 'proteinG',
      };
      final got = {
        'name': i.dishName, 'serving': x.servingSize, 'ingredients': i.ingredients, 'allergens': i.allergens, 'diet': i.dietTags,
        'codes': i.dietCodes, 'health': i.health, 'carbon': i.carbon, 'price': i.price,
        'nut': [x.calories, x.caloriesFromFat, x.totalFatG, x.satFatG, x.transFatG, x.cholesterolMg, x.sodiumMg, x.totalCarbG, x.dietaryFiberG, x.sugarsG, x.proteinG],
        'blank': x.blank,
        'dv': [x.totalFatDv, x.satFatDv, x.cholesterolDv, x.sodiumDv, x.totalCarbDv, x.dietaryFiberDv, x.sugarsDv, x.proteinDv],
      };
      final want = {
        'name': (d['dish-name'] as String).trim(), 'serving': (d['serving-size'] as String).trim(), // the parser trims attributes
        'ingredients': (d['ingredient-list'] as String).trim().isEmpty ? null : (d['ingredient-list'] as String).trim(),
        'allergens': csv(d['allergens']), 'diet': csv(d['clean-diet-str']),
        'codes': {for (final c in code) if (const {'VGT', 'VGN', 'H', 'LPR', 'SUS'}.contains(c)) c},
        'health': grade, 'carbon': const ['A', 'B', 'C', 'D', 'E'].contains(d['carbon-list']) ? d['carbon-list'] : null, 'price': d['price'],
        'nut': [for (final k in nut.keys) n(d[k])],
        'blank': {
          for (final e in nut.entries)
            if (e.key != 'calories' && !RegExp(r'-?\d').hasMatch(d[e.key])) e.value,
        },
        'dv': [for (final k in ['total-fat-dv', 'sat-fat-dv', 'cholesterol_dv', 'sodium-dv', 'total-carb-dv', 'dietary-fiber-dv', 'sugars-dv', 'protein-dv']) dv(d, k)],
      };
      for (final k in want.keys) {
        expect(got[k], want[k], reason: '${d['dish-name']}: $k');
      }
    }

    test('all 3,106 dishes, every field', () {
      expect(dishes, hasLength(3106));
      dishes.forEach(check);
    });

    for (final (label, pick) in <(String, bool Function(Map<String, dynamic>))>[
      ('Onions: blank is exactly {transFatG}', (d) => d['dish-name'] == 'Onions' && !RegExp(r'\d').hasMatch(d['trans-fat'])),
      ('absent cholesterol_dv stays null', (d) => !d.containsKey('cholesterol_dv')),
      ('priced, H/VGT webcode, allergens, ingredients, carbon', (d) =>
          d['price'] != null && d['recipe-webcode'].contains('VGT') && (d['recipe-webcode'] as String).split(' ').contains('H') &&
          d['allergens'] != '' && d['ingredient-list'] != '' && d['carbon-list'] == 'A'),
    ]) {
      test('pinned: $label', () {
        final d = dishes.firstWhere(pick, orElse: () => fail('no such dish'));
        check(d);
        final i = parsed(d);
        if (label.startsWith('Onions')) expect(i.nutrition.blank, {'transFatG'});
        if (label.startsWith('absent')) expect(i.nutrition.cholesterolDv, isNull);
        if (label.startsWith('priced')) {
          expect(i.price, isNotNull);
          expect(i.dietCodes, containsAll(['VGT', 'H']));
          expect(i.allergens, isNotEmpty);
          expect(i.ingredients, isNotNull);
          expect(i.carbon, 'A');
        }
      });
    }
  });

  test('recorded busy at 12:41 reproduces M2 per hall; catalog is empty', () async {
    final r = await repo('/hall/worcester?data=recorded&at=2026-10-08T12:41');
    final h = (await r.hours('2026-10-08').toList()).last as Loaded<HoursData>;
    expect(h.value.locationIds.values, containsAll([1, 2, 3, 4]));
    final reads = await r.busyReads(h.value);
    final got = {for (final e in reads.entries) if (e.key.contains('Commons')) e.key.split(' ').first: (e.value.level, e.value.vsUsual, e.value.calmerAt, e.value.confidence)};
    expect(got['Worcester'], (2, VsUsual.usual, '13:30', Confidence.good));
    expect(got['Franklin'], (1, VsUsual.usual, null, Confidence.low));
    expect(got['Hampshire'], (0, VsUsual.quieter, null, Confidence.good));
    expect(got['Berkshire'], (2, VsUsual.busier, null, Confidence.low));
    expect((await r.dishCatalog().toList()).last, isA<Loaded<List<DishCatalogEntry>>>());
  });

  group('recorded PDFs', () {
    const commonwealth = 'The Commonwealth Restaurant';
    late Directory dir;
    final asked = <String>[];
    setUp(() {
      dir = Directory.systemTemp.createTempSync('recorded_pdf_test');
      asked.clear();
    });
    tearDown(() => dir.deleteSync(recursive: true));

    // synthetic stand-ins: the real PDFs are UMass's and never in the repo
    Future<List<int>> fake(String file) async {
      asked.add(file);
      return utf8.encode('%PDF-1.4\n%$file\n');
    }

    Future<List<String>> links(Repository r) async {
      final last = (await r.hours('2026-10-08').toList()).last;
      final feed = (last is Loaded<HoursData> ? last.value : (last as LoadedOffline<HoursData>).value).feed;
      final menu = resolveCafeMenu(const [], feed.retail.firstWhere((c) => c.name == commonwealth)) as StandingCafeMenu;
      return [for (final l in (menu.menu as RetailMenuPdf).links) l.url];
    }

    Future<Repository> rec(String route, {List<String> pins = const []}) =>
        recordedRepository(recordedFlags(route)!, db, read: _read, readPdf: fake, pins: pins, pdfDir: dir);

    test('The Commonwealth lists its four PDFs, each served from its own local file', () async {
      final r = await rec('/cafe/c29?data=recorded&at=2026-10-08T12:41');
      final urls = await links(r);
      expect(urls, hasLength(4));
      for (final u in urls) {
        expect(await r.pdfs!.open(u).toList(), [isA<Loading<File>>(), isA<Loaded<File>>()]);
      }
      expect(asked, ['Lunch.pdf', 'Lite-fare.pdf', 'Dinner.pdf', 'Dessert.pdf']);
    });

    test('offline: a pinned café opens its PDFs, an unpinned one says not saved', () async {
      final pinned = await rec('/?data=recorded&at=2026-10-08T12:41&net=offline', pins: [commonwealth]);
      for (final u in await links(pinned)) {
        expect(await pinned.pdfs!.open(u).toList(), [isA<Loaded<File>>()]);
      }
      final other = Directory.systemTemp.createTempSync('recorded_pdf_test2');
      addTearDown(() => other.deleteSync(recursive: true));
      final bare = await recordedRepository(recordedFlags('/?data=recorded&at=2026-10-08T12:41&net=offline')!, db, read: _read, readPdf: fake, pdfDir: other);
      expect((await bare.pdfs!.open((await links(pinned)).first).toList()).last, isA<NotSaved<File>>());
    });

    test('a checkout without the local PDFs fails the menu, not the app', () async {
      final r = await recordedRepository(recordedFlags('/?data=recorded&at=2026-10-08T12:41')!, db, read: _read, readPdf: (f) async => throw 'not linked', pdfDir: dir);
      expect((await r.pdfs!.open((await links(r)).first).toList()).last, isA<Failed<File>>());
    });
  });
}
