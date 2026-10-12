import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/fixture.dart';
import 'package:udine_bakeoff/logic/menu_view.dart';
import 'support.dart';

Prefs prefs({bool veg = false, bool plant = false, bool halal = false, List<String> avoid = const []}) =>
    Prefs(veg: veg, plant: plant, halal: halal, avoid: avoid);
List<Dish> all(String day, String place, String meal) => fx.days[day]![place]![meal]!.expand((s) => s.dishes).toList();
List<Dish> names(MenuView v) => v.sections.expand((s) => s.dishes).toList();
MenuView w(Prefs p, [bool showAll = false]) => menuView(fx, today, 'W', 'lunch', p, showAll);

void main() {
  group('menuView: allergens and diet', () {
    test('hides every dish that lists an avoided allergen and counts them', () {
      final v = w(prefs(avoid: ['Fish']));
      final removed = all(today, 'W', 'lunch').where((d) => d.allergens.contains('Fish')).toList();
      expect(removed, isNotEmpty);
      expect(names(v).any((d) => d.allergens.contains('Fish')), isFalse);
      expect(v.hidden, removed.length);
      expect(names(v), hasLength(all(today, 'W', 'lunch').length - removed.length));
    });
    test('Show all returns everything, hides nothing and never reads the preference', () {
      final p = prefs(avoid: ['Milk']);
      final v = menuView(fx, today, 'W', 'lunch', p, true);
      expect(names(v), hasLength(all(today, 'W', 'lunch').length));
      expect(v.hidden, 0);
      expect(p.avoid, ['Milk']);
    });
    test('a dish that lists no allergens always shows', () {
      final blank = all(today, 'W', 'lunch').where((d) => d.allergens.isEmpty).toList();
      expect(blank, isNotEmpty);
      final v = w(prefs(avoid: [...allergens]));
      for (final d in blank) {
        expect(names(v), contains(d));
      }
    });
    test('vegetarian keeps plant based dishes (plant implies veg)', () {
      final plant = all(today, 'W', 'lunch').where((d) => d.diet & 2 != 0).toList();
      expect(plant, isNotEmpty);
      final v = w(prefs(veg: true));
      for (final d in plant) {
        expect(names(v), contains(d));
      }
      expect(names(v).every((d) => d.diet & 3 != 0), isTrue);
    });
    test('stations keep the feed order and empty ones are dropped', () {
      final feed = fx.days[today]!['W']!['lunch']!.map((s) => s.name).toList();
      expect(w(prefs()).sections.map((s) => s.name).toList(), feed);
      final v = w(prefs(avoid: [...allergens]));
      expect(v.sections.map((s) => s.name).toList(), feed.where((n) => v.sections.any((s) => s.name == n)).toList());
      expect(v.sections.every((s) => s.dishes.isNotEmpty), isTrue);
    });
    test('hits lists only the avoided allergens a dish lists', () {
      final d = all(today, 'W', 'lunch').firstWhere((x) => x.allergens.contains('Milk') && x.allergens.length > 1);
      expect(hits(prefs(avoid: ['Milk']), d), ['Milk']);
      expect(hits(prefs(), d), isEmpty);
    });
  });

  group('menuView: the one line over the list', () {
    int n(List<String> avoid) => all(today, 'W', 'lunch').where((d) => avoid.any(d.allergens.contains)).length;
    test('no preferences, no line', () => expect(w(prefs()).line, isNull));
    test('counts what it hides and names the allergen', () {
      expect(w(prefs(avoid: ['Milk'])).line, 'Hiding ${n(['Milk'])} dishes that list milk');
    });
    test('leads with the diet when one is on', () {
      final k = w(prefs(veg: true, avoid: ['Milk'])).hidden;
      expect(k, greaterThan(1));
      expect(w(prefs(veg: true, avoid: ['Milk'])).line, 'Showing vegetarian dishes, hiding $k that list milk');
    });
    test('a diet alone still says so', () => expect(w(prefs(plant: true, halal: true)).line, 'Showing plant based, halal dishes'));
    test('revealed, it says so', () => expect(w(prefs(avoid: ['Milk']), true).line, 'Showing all dishes'));
    test('names up to three allergens, then counts the rest', () {
      final l = w(prefs(avoid: ['Milk', 'Eggs', 'Soy', 'Wheat', 'Fish'])).line!;
      expect(l, matches(RegExp(r'^Hiding \d+ dishes that list [a-z ]+, [a-z ]+, [a-z ]+ or \d+ more$')));
    });
    test('singular for one dish', () {
      expect(menuView(fx, today, 'F', 'lunch', prefs(avoid: ['Tree Nuts']), false).line, 'Hiding 1 dish that lists tree nuts');
    });
  });

  group('menuView: days and meals', () {
    test('an empty day has no meals and no sections', () {
      expect(mealsOf(fx, '2026-10-10', 'W'), isEmpty);
      final v = menuView(fx, '2026-10-10', 'W', 'lunch', noPrefs, false);
      expect([v.sections, v.hidden, v.line], [isEmpty, 0, isNull]);
    });
    test("meals follow M2's order", () {
      expect(mealsOf(fx, today, 'F'), ['breakfast', 'lunch', 'dinner', 'grab']);
      expect(mealsOf(fx, '2026-10-11', 'F'), ['lunch', 'dinner']);
      expect(mealsOf(fx, today, 'W'), ['breakfast', 'lunch', 'dinner', 'late', 'grab']);
    });
    test("the meal is kept when the new day has it, else the clock's, else all day, else the first", () {
      expect(defaultMeal(fx, today, 'F', 'dinner'), 'dinner');
      expect(defaultMeal(fx, '2026-10-11', 'F', 'breakfast'), 'lunch');
      expect(defaultMeal(fx, today, 'c12', 'lunch'), 'all');
      expect(defaultMeal(fx, today, 'c27', 'lunch'), 'breakfast');
    });
    test('a one-menu café has no tab row; a hall and a multi-meal café do', () {
      expect(isOneMeal(fx, 'c12'), isTrue);
      expect(isOneMeal(fx, 'c17'), isTrue);
      expect(isOneMeal(fx, 'c10'), isFalse);
      expect(isOneMeal(fx, 'W'), isFalse);
    });
    test('the day cell and its full name', () {
      expect([0, 1, 2, 3].map((i) => dayCell(fx, i)).toList(), ['Today', 'Fri 9', 'Sat 10', 'Sun 11']);
      expect(dayFull(fx, 2), 'Saturday, October 10');
      expect(dayLong(fx, 1), 'Tomorrow');
    });
  });

  group('rowScores (Review Focus 5)', () {
    const on = (health: true, carbon: true);
    test('an unscored dish leaves nothing to draw, whatever the toggles', () {
      expect(rowScores(null, null, on), isNull);
      expect(rowScores(null, null, (health: true, carbon: false)), isNull);
    });
    test('draws only the scored kinds the toggles allow', () {
      expect(rowScores(5, null, on), (health: 5, carbon: null));
      expect(rowScores(null, 'B', on), (health: null, carbon: 'B'));
      expect(rowScores(5, 'B', (health: false, carbon: true)), (health: null, carbon: 'B'));
      expect(rowScores(5, 'B', (health: false, carbon: false)), isNull);
    });
    test('H0 is a real zero', () => expect(rowScores(0, null, on), (health: 0, carbon: null)));
    test('every dish in the fixture with a raw number but no H code draws nothing', () {
      final unscored = fx.dishes.where((d) => d.health == null && d.carbon == null).toList();
      expect(unscored, isNotEmpty);
      for (final d in unscored) {
        expect(rowScores(d.health, d.carbon, on), isNull);
      }
    });
  });

  group('menuItems', () {
    test("flattens a view to one list: the line, then each station's head and its dishes", () {
      final p = prefs(avoid: ['Milk']);
      final v = menuView(fx, today, 'W', 'lunch', p, false);
      final items = menuItems(v, p, false, '');
      expect([items[0].t, items[0].line, items[0].revealed], ['note', v.line, false]);
      expect(items.where((i) => i.t == 'head').map((i) => i.name).toList(), v.sections.map((s) => s.name).toList());
      expect(items.where((i) => i.t == 'dish'), hasLength(names(v).length));
      expect([items[1].t, items[1].si], ['head', 0]);
    });
    test('only a revealed row carries Contains, and only for the allergens you avoid', () {
      final p = prefs(avoid: ['Milk']);
      final hid = menuItems(menuView(fx, today, 'W', 'lunch', p, false), p, false, '');
      expect(hid.every((i) => i.t != 'dish' || i.contains.isEmpty), isTrue);
      final shown = menuItems(menuView(fx, today, 'W', 'lunch', p, true), p, true, '');
      expect(shown.where((i) => i.t == 'dish' && i.contains.isNotEmpty), hasLength(20));
      expect([shown[0].t, shown[0].line, shown[0].revealed], ['note', 'Showing all dishes', true]);
    });
    test('no line, no note row; an empty day is one empty row', () {
      expect(menuItems(menuView(fx, today, 'W', 'lunch', noPrefs, false), noPrefs, false, '')[0].t, 'head');
      final e = menuItems(menuView(fx, '2026-10-10', 'W', 'lunch', noPrefs, false), noPrefs, false, 'No menu posted for Saturday, October 10.');
      expect(e.map((i) => [i.t, i.text]).toList(), [['empty', 'No menu posted for Saturday, October 10.']]);
    });
  });

  group('prefSummary', () {
    test('says Everything with no preferences', () => expect(prefSummary(noPrefs), 'Everything'));
    test('names the diet, then what is avoided, capitalised once', () {
      expect(prefSummary(prefs(veg: true, avoid: ['Milk', 'Tree Nuts'])), 'Vegetarian, no milk or tree nuts');
      expect(prefSummary(prefs(avoid: ['Fish'])), 'No fish');
    });
    test('plant based covers vegetarian, and halal joins it', () {
      expect(prefSummary(prefs(veg: true, plant: true, halal: true)), 'Plant based, halal');
    });
    test('counts the rest past three', () {
      expect(prefSummary(prefs(avoid: ['Milk', 'Eggs', 'Fish', 'Soy', 'Corn'])), 'No milk, eggs, fish or 2 more');
    });
  });
}
