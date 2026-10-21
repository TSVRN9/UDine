import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/core/store/db.dart';
import 'package:udine/core/store/store.dart';
import 'package:udine/core/types.dart';
import 'package:udine/shell/prefs.dart';

// The favourite star (M2 `act==='fav'`): device-only, in RN's `favorites` table as `dish` rows, so RN's own favourites carry over and
// export sees them. No sign-in exists in this app, so nothing here ever leaves the device.
void main() {
  late UdineStore store;
  setUp(() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    final db = (await openStore(inMemoryDatabasePath)) as StoreReady;
    addTearDown(db.db.close);
    store = UdineStore(db.db);
  });

  test('a favourite is a dish row in the device store, read back by the next launch', () async {
    final prefs = await AppPrefs.load(store);
    expect(prefs.isFavorite('Golden BBQ Chicken Thigh'), isFalse);
    var told = 0;
    prefs.addListener(() => told++);
    await prefs.toggleFavorite('Golden BBQ Chicken Thigh');
    expect(prefs.isFavorite('Golden BBQ Chicken Thigh'), isTrue);
    expect(told, 1);
    expect([for (final f in await store.favorites()) f.key], ['dish:Golden BBQ Chicken Thigh']);
    expect((await AppPrefs.load(store)).isFavorite('Golden BBQ Chicken Thigh'), isTrue);
  });

  test('toggling again removes it, and a location favourite RN saved is neither shown as a dish nor lost', () async {
    await store.addFavorite(const LocationFavorite(2));
    final prefs = await AppPrefs.load(store);
    await prefs.toggleFavorite('Pizza');
    await prefs.toggleFavorite('Pizza');
    expect(prefs.isFavorite('Pizza'), isFalse);
    expect([for (final f in await store.favorites()) f.key], ['location:2']);
  });

  test('a Fountain Drink starred before round 12d is not a favourite any more, and the device row stays for export', () async {
    await store.addFavorite(const DishFavorite('Fountain Drink'));
    final prefs = await AppPrefs.load(store);
    expect(prefs.favorites, isEmpty);
    expect([for (final f in await store.favorites()) f.key], ['dish:Fountain Drink']);
  });

  test('with no store (a newer build owns the database) the star works for the session and writes nothing', () async {
    final prefs = await AppPrefs.load(null);
    await prefs.toggleFavorite('Pizza');
    expect(prefs.isFavorite('Pizza'), isTrue);
  });
}
