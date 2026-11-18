// The ordered groups Search draws, from M2's `renderSearch`: Places, the preferences line, "<Meal> now", At cafés, Later, the extras
// slot (packaged foods), then the custom-food button.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/data/packaged_search.dart' show LookupPhase, PackPhase;
import 'package:udine/core/types.dart';
import 'package:udine/core/packaged_food.dart';
import 'package:udine/core/saved_food.dart' show SavedFood;
import 'package:udine/core/m2/menu_view.dart';
import 'package:udine/core/m2/search.dart';
import 'package:udine/data/repository.dart' show DishCatalogEntry;
import 'package:udine/screens/halls/halls_model.dart' show NetLine;
import 'package:udine/screens/search/search_entries.dart';
import '../core/m2/support.dart';

final now = DateTime.parse('2026-10-08T12:41:00-04:00');
final ix = SearchIndex(board, now);
List<SearchEntry> entries(String q, {Set<Lens> lenses = const {}, Prefs prefs = noPrefs, bool reveal = false, bool track = true, bool extras = false, NetLine net = NetLine.none}) =>
    searchEntries(net: net, raw: runSearch(ix, query: q, lenses: lenses), query: q, lenses: lenses, meal: 'lunch', prefs: prefs, reveal: reveal, track: track, extras: extras ? const [LookupButtonEntry('x')] : const []);
List<String> shape(List<SearchEntry> e) => [for (final x in e) switch (x) { GroupHead(:final title) => title, HallCardsEntry() => 'cards', PlaceEntry() => 'place', NowEntry(:final cafe) => cafe ? 'cafe' : 'now', LaterEntry() => 'later', DietLine() => 'diet', EmptyEntry() => 'empty', LookupButtonEntry() => 'extras', FoodEntry() => 'food', PackWaitEntry() => 'pack-wait', PackFailEntry() => 'pack-fail', LookupStateEntry() => 'lookup', CustomEntry(:final solid) => solid ? 'custom!' : 'custom'}];

void main() {
  test('idle: the halls\' lunch under its title, no places, cafés or later rows', () {
    final s = shape(entries(''));
    expect(s.take(2), ['Lunch now', 'now']);
    expect(s, isNot(contains('place')));
    expect(s, isNot(contains('cafe')));
    expect(s, isNot(contains('later')));
  });
  test('a query with places, dishes, cafés and later rows: every group in M2\'s order, then the custom button', () {
    final s = shape(entries('chicken'));
    final order = ['Places', 'Lunch now', 'At cafés', 'Later today and tomorrow'].where(s.contains).map(s.indexOf).toList();
    expect(order, equals([...order]..sort()));
    expect(s.last, 'custom');
  });
  test('only now-results under a query: no title', () {
    final r = runSearch(ix, query: 'brisket');
    final e = searchEntries(raw: SearchResult(now: r.now), query: 'brisket', lenses: const {}, meal: 'lunch', prefs: noPrefs, reveal: false, track: true);
    expect(shape(e).first, 'now');
  });
  test('Places lead with the hall cards as one block, then the rows', () {
    final s = shape(entries('worcester'));
    expect(s.take(3), ['Places', 'cards', 'place']);
  });
  test('no match: the empty line, the extras, then the solid custom button when nothing else is offered', () {
    expect(shape(entries('zzzq')), ['empty', 'custom!']);
    expect(shape(entries('zzzq', extras: true)), ['empty', 'extras', 'custom']);
  });
  test('no match without a query: the lens\' own line; Favorites says how to fill it; no custom button', () {
    expect(shape(entries('', lenses: {Lens.fav})), ['empty']);
    final t = (entries('', lenses: {Lens.fav}).single as EmptyEntry).text;
    expect(t, "Star a dish from its details and it shows up here whenever it's served.");
    final u = (searchEntries(raw: const SearchResult(), query: '', lenses: {Lens.protein}, meal: 'lunch', prefs: noPrefs, reveal: false, track: true).single as EmptyEntry).text;
    expect(u, 'No dishes match these filters at lunch.');
  });
  test('the empty line names the query', () {
    expect((entries('zzzq').first as EmptyEntry).text, 'Nothing called “zzzq” is on any menu today or tomorrow.');
  });
  test('tracking off: no custom button', () => expect(shape(entries('zzzq', track: false)), ['empty']));
  test('a dish the preferences hide goes, the line says so, Show all brings it back', () {
    const veg = Prefs(veg: true);
    final hidden = entries('chicken', prefs: veg), shown = entries('chicken', prefs: veg, reveal: true);
    expect(shape(hidden), contains('diet'));
    expect((hidden.firstWhere((e) => e is DietLine) as DietLine).revealed, isFalse);
    expect((shown.firstWhere((e) => e is DietLine) as DietLine).revealed, isTrue);
    expect(shown.whereType<NowEntry>().length, greaterThan(hidden.whereType<NowEntry>().length));
  });
  test('everything hidden by preferences still shows the line, and is not "no match"', () {
    final e = entries('chicken', prefs: const Prefs(avoid: ['Milk', 'Eggs', 'Fish', 'Shellfish', 'Tree Nuts', 'Peanuts', 'Wheat', 'Soy', 'Sesame', 'Gluten', 'Corn'], halal: true, veg: true, plant: true));
    expect(shape(e), isNot(contains('empty')));
  });
  test('offline, no match: the empty line says a saved menu; online it says any menu', () {
    String empty(NetLine n) => (entries('zzzq', net: n).whereType<EmptyEntry>().single).text;
    expect(empty(NetLine.offline), 'Nothing called “zzzq” is on a saved menu.');
    expect(empty(NetLine.none), 'Nothing called “zzzq” is on any menu today or tomorrow.');
  });
  test('failed: no empty line, only the custom button (solid) and the extras', () {
    expect(shape(entries('zzzq', net: NetLine.failed)), ['custom!']);
    expect(shape(entries('zzzq', net: NetLine.failed, extras: true)), ['extras', 'custom']);
  });

  group('no results are said once', () {
    List<String> miss(List<SearchEntry> extras, {NetLine net = NetLine.none}) => shape(searchEntries(
        net: net, raw: runSearch(ix, query: 'zzzq'), query: 'zzzq', lenses: const {}, meal: 'lunch', prefs: noPrefs, reveal: false, track: true, extras: extras));
    final lookup = (LookupPhase p) => LookupStateEntry(p, 'zzzq', null);

    test('the lookup finding nothing adds no second line: the one miss line, then the solid custom button', () {
      expect(miss([lookup(LookupPhase.none)]), ['empty', 'custom!']);
    });
    test('nothing asked yet: the miss line, the lookup button, the custom button', () {
      expect(miss(const [LookupButtonEntry('zzzq')]), ['empty', 'extras', 'custom']);
    });
    test('failed and rate-limited lookups keep their line', () {
      expect(miss([lookup(LookupPhase.failed)]), ['empty', 'lookup', 'custom']);
      expect(miss([lookup(LookupPhase.limited)]), ['empty', 'lookup', 'custom']);
    });
    test('catalog matches answer the menu miss: no miss line, the group stands', () {
      expect(miss([const GroupHead('UMass Dining'), FoodEntry(SavedFood.custom(CustomFood(id: 'x', name: 'zzzq', servingSize: '1', nutrition: NutritionFacts(servingSize: '1', calories: 1, caloriesFromFat: 0, totalFatG: 0, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, totalCarbG: 0, dietaryFiberG: 0, sugarsG: 0, proteinG: 0))))]),
          ['UMass Dining', 'food', 'custom']);
    });
  });

  group('extraEntries', () {
    PackagedFood hit(int i) => PackagedFood(
          source: OffSource(barcode: '$i', productName: 'Bar $i'), productName: 'Bar $i',
          nutrition: NutritionFacts(servingSize: 'per 100g', calories: 100, caloriesFromFat: 0, totalFatG: 1, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, totalCarbG: 1, dietaryFiberG: 0, sugarsG: 0, proteinG: 1),
        );
    List<SearchEntry> run(List<PackagedFood> hits) => extraEntries(
        track: true, online: true, query: 'bar', foods: const [], pack: PackPhase.ok, packHits: hits, lookup: LookupPhase.idle, lookupFoods: const []);

    test('the Packaged group is about 20 in total: the merged, deduped list is cut at 20', () {
      final e = run([for (var i = 0; i < 35; i++) hit(i)]);
      expect(e.whereType<FoodEntry>(), hasLength(20));
      expect((e.whereType<FoodEntry>().last.food.name), 'Bar 19');
    });

    DishCatalogEntry dish(String n) => DishCatalogEntry(dishName: n, nutrition: hit(0).nutrition, allergens: const [], dietTags: const [], updatedAt: '2026-10-01T00:00:00+00:00');
    List<SearchEntry> withCatalog(List<DishCatalogEntry> c, {bool track = true, bool online = true, Set<String> served = const {}, LookupPhase lookup = LookupPhase.idle, List<PackagedFood> found = const []}) => extraEntries(
        track: track, online: online, query: 'bar', foods: const [], pack: PackPhase.idle, packHits: const [], lookup: lookup, lookupFoods: found, catalog: c, served: served);

    test('UMass Dining lists every catalog match that is on no menu: uncapped, tracking off or on, online or not', () {
      final c = [for (var i = 0; i < 40; i++) dish('Bar $i'), dish('Soup')];
      for (final (track, online) in [(true, true), (false, true), (true, false), (false, false)]) {
        final e = withCatalog(c, track: track, online: online, served: {'bar 3'});
        expect(e.whereType<GroupHead>().map((g) => g.title), ['UMass Dining']);
        expect(e.whereType<FoodEntry>(), hasLength(39), reason: 'track $track online $online');
      }
    });

    test('a lookup answer the catalog already holds is shown once', () {
      final e = withCatalog([dish('Bar 1')], lookup: LookupPhase.found, found: [hit(1), hit(2)]);
      expect(e.whereType<FoodEntry>().map((f) => f.food.name), ['Bar 1', 'Bar 2']);
      expect(e.whereType<GroupHead>(), hasLength(1));
    });

    test('a name repeated by another source is cut before the 20 are counted', () {
      final e = run([for (var i = 0; i < 40; i++) hit(i % 25)]);
      expect(e.whereType<FoodEntry>(), hasLength(20));
    });
  });
}
