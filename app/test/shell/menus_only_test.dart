import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/shell/prefs.dart';
import '../fonts.dart';
import '../screens/support.dart';

// The user's database was saved by a newer build: menus only. The file is never opened for writing and nothing is written to it.
void main() {
  setUpAll(loadFonts);

  late Directory dir;
  late String path;
  setUp(() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    dir = Directory('${Platform.environment['HOME']}/.cache/udine-scratch/menus-only-${DateTime.now().microsecondsSinceEpoch}')..createSync(recursive: true);
    path = '${dir.path}/udine.db';
    final db = await databaseFactoryFfi.openDatabase(path);
    await db.execute('CREATE TABLE preferences_kv (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL)');
    await db.execute('INSERT INTO preferences_kv VALUES (\'m2:pins\', \'["Wasabi"]\')');
    await db.execute('PRAGMA user_version = ${kUserVersion + 1}');
    await db.close();
  });
  tearDown(() => dir.deleteSync(recursive: true));

  List<int> digest() => File(path).readAsBytesSync();
  List<String> files() => dir.listSync().map((e) => e.path.split('/').last).toList()..sort();

  test('a newer database gives no store, and the file is untouched (bytes and siblings)', () async {
    final before = (digest(), files());
    final (cache, store) = await Boot.openDb(dbPath: path);
    expect(store, isNull);
    final prefs = await AppPrefs.load(store);
    await prefs.setCharlesRiver(true); // the in-memory session value
    await prefs.setPins(['Tamales']);
    expect(prefs.charlesRiver, isTrue);
    expect(prefs.pins, ['Tamales']);
    await cache.rawInsert("INSERT INTO preferences_kv VALUES ('menu:v2:1|x', '{}')"); // the menu cache is a throwaway
    expect(digest(), before.$1);
    expect(files(), before.$2);
  });

  test('nothing in the shell or the screens reaches the store: every write path is closed', () {
    final reach = RegExp(r'\.store\b|UdineStore|openStore|udineDbPath|openDatabase|sqflite|databaseFactory');
    final bad = <String>[];
    for (final d in ['lib/shell', 'lib/screens', 'lib/motion']) {
      for (final f in Directory(d).listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
        // prefs.dart, food_book.dart and app_scope.dart are the holders; they do nothing with a null store
        if (f.path.endsWith('prefs.dart') || f.path.endsWith('food_book.dart') || f.path.endsWith('app_scope.dart')) continue;
        for (final l in f.readAsLinesSync()) {
          if (reach.hasMatch(l.replaceFirst(RegExp(r'//.*'), ''))) bad.add('${f.path}: ${l.trim()}');
        }
      }
    }
    expect(bad, isEmpty, reason: 'a screen that writes must check Boot.menusOnly first');
  });

  testWidgets('the app runs on a newer database: Halls shows, a pin is kept in memory only, nothing is written', (t) async {
    final before = (digest(), files());
    final rec = await bootRecorded(t);
    final (_, store) = (await t.runAsync(() => Boot.openDb(dbPath: path)))!;
    final prefs = (await t.runAsync(() => AppPrefs.load(store, pins: const ['Wasabi'])))!;
    final boot = Boot(rec.repo, store, prefs);
    expect(boot.menusOnly, isTrue);
    await openApp(t, boot);
    await until(t, () => find.text('Wasabi').evaluate().isNotEmpty);
    await t.runAsync(() => prefs.setCharlesRiver(true));
    await t.pump();
    expect(find.text('Charles River Campus, Newton'), findsOneWidget); // the toggle works for the session, in memory
    expect(digest(), before.$1);
    expect(files(), before.$2);
  });
}
