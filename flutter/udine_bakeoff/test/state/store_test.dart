// Task 7's store contract (RN state/store.test.ts), in Dart: one store, device-only persistence.
import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:udine_bakeoff/logic/fixture.dart';
import 'package:udine_bakeoff/logic/menu_view.dart';
import 'package:udine_bakeoff/state/seed.dart';
import 'package:udine_bakeoff/state/store.dart';
import '../logic/support.dart';

Map<String, Dish> refsFor(String meal, String name, List<String> places) => {for (final p in places) p: servingOn(fx, today, p, meal, dishKey(name))!};
const brisket = 'Beef Brisket Noodle Bowl', bbq = 'Golden BBQ Chicken Thigh';
// a Franklin lunch dish Worcester does not serve at lunch: it cannot join a Worcester plate
final worcester = fx.days[today]!['W']!['lunch']!.expand((s) => s.dishes).map((d) => d.key).toSet();
final franklinOnly = fx.days[today]!['F']!['lunch']!.expand((s) => s.dishes).firstWhere((d) => !worcester.contains(d.key));
const key = 'bakeoff.store.v1';

Store fresh([Map<String, Object> kept = const {}]) {
  SharedPreferences.setMockInitialValues(kept);
  return Store(fx);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('a conflicting-hall dish makes a second plate and moves front to it', () {
    final s = fresh()
      ..add('lunch', brisket, refsFor('lunch', brisket, ['W']))
      ..add('lunch', franklinOnly.name, {'F': franklinOnly});
    expect(s.plates.plates, hasLength(2));
    expect(s.plates.front, 1);
    expect(s.plates.plates[1].items[0].name, franklinOnly.name);
  });

  test('a café item starts its own plate, never joining the hall plate', () {
    final s = fresh()..add('lunch', brisket, refsFor('lunch', brisket, ['W']));
    final cafe = fx.days[today]!.entries.firstWhere((e) => isCafe(e.key) && e.value['all'] != null);
    final dish = cafe.value['all']![0].dishes[0];
    s.add('lunch', dish.name, {cafe.key: dish});
    expect(s.plates.plates, hasLength(2));
  });

  group('log and undo', () {
    Store two() => fresh()
      ..add('lunch', brisket, refsFor('lunch', brisket, ['W', 'B']))
      ..add('lunch', bbq, refsFor('lunch', bbq, ['W']))
      ..add('lunch', franklinOnly.name, {'F': franklinOnly});

    test('moves the front plate into the log, and undo puts it back at the same index', () {
      final s = two()..setFront(0);
      final before = s.plates.plates;
      s.logPlate();
      expect(s.plates.plates, hasLength(1));
      expect(s.plates.plates[0].items[0].name, franklinOnly.name);
      expect(s.log, hasLength(1));
      expect(s.log[0].items.map((i) => [i.name, i.qty]).toList(), [[brisket, 1.0], [bbq, 1.0]]);
      s.undo();
      expect(s.log, isEmpty);
      expect(s.plates.plates, before);
      expect(s.plates.front, 0);
      expect(s.last, isNull);
    });

    test('undo of a later plate restores it in the middle, not at the end', () {
      final s = two()..add('lunch', brisket, refsFor('lunch', brisket, ['W', 'B'])); // front goes back to the Worcester plate
      s.setFront(0);
      s.logPlate();
      s.undo();
      expect(s.plates.plates.map((p) => p.items[0].name).toList(), [brisket, franklinOnly.name]);
      expect(s.plates.front, 0);
    });

    test("logs the plate's macros from the hall it is logged at", () {
      final refs = refsFor('lunch', brisket, ['W', 'B']);
      final s = fresh()..add('lunch', brisket, refs);
      s.logPlate('B');
      expect(s.log[0].place, 'B');
      expect(s.log[0].items[0].cal, refs['B']!.cal);
    });

    test('an add while the receipt is up drops the receipt, so a stale Undo cannot restore over the new plate', () {
      final s = two()..logPlate();
      expect(s.last, isNotNull);
      s.add('lunch', bbq, refsFor('lunch', bbq, ['W']));
      expect(s.last, isNull);
      s.undo();
      expect(s.log, hasLength(1));
    });

    test('undo with nothing to undo does nothing', () {
      final s = two();
      var notified = 0;
      s.addListener(() => notified++);
      s.undo();
      expect(notified, 0);
    });
  });

  test('show, prefs, the Charles River toggle and the log survive a reload', () async {
    final a = fresh()
      ..setShow(carbon: true)
      ..setPrefs(halal: true, avoid: ['Milk', 'Soy'])
      ..setNewton(true)
      ..add('lunch', bbq, refsFor('lunch', bbq, ['W']))
      ..logPlate();
    await a.flush();
    final b = Store(fx);
    expect(b.show, const Toggles(health: false, carbon: false)); // not read yet
    await b.hydrate();
    expect(b.show, const Toggles(health: false, carbon: true));
    expect(b.prefs, const Prefs(halal: true, avoid: ['Milk', 'Soy']));
    expect(b.newton, isTrue);
    expect(b.log.map((e) => e.items[0].name).toList(), [bbq]);
  });

  test('a stored value that is not the store\'s shape is ignored, not trusted', () async {
    final s = fresh({key: '{"prefs":{"veg":"yes","avoid":7},"show":null,"log":"x"}'});
    await s.hydrate();
    expect(s.prefs, noPrefs);
    expect(s.log, isEmpty);
  });

  test('a field of the right shape is kept even when its neighbour is wrong', () async {
    final s = fresh({key: '{"prefs":{"veg":"yes"},"show":{"health":true,"carbon":false},"newton":true}'});
    await s.hydrate();
    expect(s.show, const Toggles(health: true, carbon: false));
    expect(s.newton, isTrue);
    expect(s.prefs, noPrefs);
  });

  test('an add made before the reload finished is not lost to it', () async {
    final a = fresh()..setPrefs(veg: true);
    await a.flush();
    final b = Store(fx)..add('lunch', bbq, refsFor('lunch', bbq, ['W']));
    await b.hydrate();
    expect(b.prefs.veg, isTrue);
    expect(b.plates.plates, hasLength(1));
  });

  test('turning Charles River off sets its plates aside, and on brings them back as they were', () {
    final s = fresh();
    final newton = fx.places.firstWhere((p) => p.area == 4 && fx.days[today]![p.key]?['lunch'] != null);
    final dish = fx.days[today]![newton.key]!['lunch']![0].dishes[0];
    s
      ..setNewton(true)
      ..add('lunch', bbq, refsFor('lunch', bbq, ['W']))
      ..add('lunch', dish.name, {newton.key: dish});
    final both = s.plates.plates;
    expect(both, hasLength(2));
    s.setNewton(false);
    expect(s.plates.plates.map((p) => p.items[0].name).toList(), [bbq]);
    expect(s.plates.front, 0);
    s.setNewton(true);
    expect(s.plates.plates, both);
  });

  test('persists only prefs, show, newton and the log: never the plate in progress, the receipt or the set-aside plates', () async {
    final s = fresh()..add('lunch', bbq, refsFor('lunch', bbq, ['W']));
    s.setPrefs(veg: true);
    s.logPlate();
    s
      ..add('lunch', brisket, refsFor('lunch', brisket, ['W', 'B']))
      ..setNewton(true);
    await s.flush();
    final kept = jsonDecode((await SharedPreferences.getInstance()).getString(key)!) as Map;
    expect(kept.keys.toList()..sort(), ['log', 'newton', 'prefs', 'show']);
  });

  test('clearPlate drops the front plate and keeps front in range', () {
    final s = fresh()
      ..add('lunch', brisket, refsFor('lunch', brisket, ['W']))
      ..add('lunch', franklinOnly.name, {'F': franklinOnly});
    s.clearPlate();
    expect((s.plates.plates.length, s.plates.front), (1, 0));
  });

  group('seed (screenshots and goldens)', () {
    test('seeds prefs and toggles; an unrelated key leaves them alone', () {
      final s = fresh();
      applySeed(s, fx, 'diet=veg,halal&avoid=Milk,Tree Nuts&scores=carbon');
      expect(s.prefs, const Prefs(veg: true, halal: true, avoid: ['Milk', 'Tree Nuts']));
      expect(s.show, const Toggles(health: false, carbon: true));
      applySeed(s, fx, 'hall=W');
      expect(s.prefs.veg, isTrue);
    });
    test('seeds plates, half quantities and a logged plate', () {
      final s = fresh();
      applySeed(s, fx, 'plate=W:lunch:beef brisket noodle bowl,golden bbq chicken thigh*2;F:lunch:${franklinOnly.key}*h&logged=1');
      expect(s.log, hasLength(1));
      expect(s.log[0].items.map((i) => [i.name, i.qty]).toList(), [[brisket, 1.0], [bbq, 2.0]]);
      expect(s.plates.plates.map((p) => p.items.map((i) => i.qty).toList()).toList(), [[0.5]]);
      expect(s.last, isNull);
    });
  });
}
