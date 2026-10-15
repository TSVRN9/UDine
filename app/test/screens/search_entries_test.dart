// The ordered groups Search draws, from M2's `renderSearch`: Places, the preferences line, "<Meal> now", At cafés, Later, the extras
// slot (packaged foods), then the custom-food button.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/menu_view.dart';
import 'package:udine/core/m2/search.dart';
import 'package:udine/screens/search/search_entries.dart';
import '../core/m2/support.dart';

final now = DateTime.parse('2026-10-08T12:41:00-04:00');
final ix = SearchIndex(board, now);
List<SearchEntry> entries(String q, {Set<Lens> lenses = const {}, Prefs prefs = noPrefs, bool reveal = false, bool track = true, bool extras = false}) =>
    searchEntries(raw: runSearch(ix, query: q, lenses: lenses), query: q, lenses: lenses, meal: 'lunch', prefs: prefs, reveal: reveal, track: track, hasExtras: extras);
List<String> shape(List<SearchEntry> e) => [for (final x in e) switch (x) { GroupHead(:final title) => title, HallCardsEntry() => 'cards', PlaceEntry() => 'place', NowEntry(:final cafe) => cafe ? 'cafe' : 'now', LaterEntry() => 'later', DietLine() => 'diet', EmptyEntry() => 'empty', ExtrasSlot() => 'extras', CustomEntry(:final solid) => solid ? 'custom!' : 'custom'}];

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
    final e = searchEntries(raw: SearchResult(now: r.now), query: 'brisket', lenses: const {}, meal: 'lunch', prefs: noPrefs, reveal: false, track: true, hasExtras: false);
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
    final u = (searchEntries(raw: const SearchResult(), query: '', lenses: {Lens.protein}, meal: 'lunch', prefs: noPrefs, reveal: false, track: true, hasExtras: false).single as EmptyEntry).text;
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
}
