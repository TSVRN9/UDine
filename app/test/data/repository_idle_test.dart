import 'dart:async';

import 'package:flutter_test/flutter_test.dart' hide Fake;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/data/source.dart';

import 'repository_test.dart' show Fake;

/// A load whose cache write is still on the database isolate when a screen test's body ends (what a loaded CI host does):
/// sqflite's 10 s lock-warning timer is then left pending. Waiting on [Repository.idle] before the last pump lets the write land.
void main() {
  testWidgets(
    'waiting on idle leaves no sqflite timer pending when the write was queued behind a busy database',
    (t) async {
      sqfliteFfiInit();
      final db = (await t.runAsync(
        () => databaseFactoryFfi.openDatabase(
          inMemoryDatabasePath,
          options: OpenDatabaseOptions(
            version: 1,
            onCreate: (d, _) => d.execute(
              'CREATE TABLE preferences_kv (key TEXT PRIMARY KEY, value_json TEXT)',
            ),
          ),
        ),
      ))!;
      addTearDown(() => t.runAsync(db.close));
      final fake = Fake()..gate = Completer<void>();
      final repo = Repository(UmassSource(fake.client), db);
      unawaited(repo.events().listen((_) {}).cancel());
      for (var i = 0; i < 100 && fake.calls.isEmpty; i++) {
        await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 20)),
        );
        await t.pump(const Duration(milliseconds: 20));
      }
      // the fetch is out: the database is now busy for a real second, as a loaded host makes it, so the save queues behind that
      await t.runAsync(() async {
        unawaited(
          db.transaction(
            (tx) => Future<void>.delayed(const Duration(seconds: 1)),
          ),
        );
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      fake.gate!.complete();
      for (var i = 0; i < 20 && repo.idle; i++) {
        await t.pump(const Duration(milliseconds: 20));
      }
      expect(repo.idle, isFalse, reason: 'the save is in flight');
      for (var i = 0; i < 300 && !repo.idle; i++) {
        await t.runAsync(
          () => Future<void>.delayed(const Duration(milliseconds: 25)),
        );
        await t.pump(const Duration(milliseconds: 16));
      }
      expect(repo.idle, isTrue);
      await t.pump(const Duration(seconds: 2));
    },
  );
}
