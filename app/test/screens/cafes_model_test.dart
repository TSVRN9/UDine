import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/m2/places.dart';
import 'package:udine/core/content.dart';
import 'package:udine/core/types.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/screens/cafes/cafes_model.dart';

final noon = easternInstant(DateTime.utc(2026, 10, 8, 12, 41));

DiningHoursFeed feed(Map<String, (String, String)?> hours) => DiningHoursFeed(
      halls: const [],
      retail: [
        for (final e in hours.entries)
          RetailLocationHours(name: e.key, hours: e.value == null ? null : TimeWindow(openTime: e.value!.$1, closeTime: e.value!.$2), description: 'd'),
      ],
    );

void main() {
  final all = feed({for (final c in cafeTable) c.title: ('08:00 AM', '09:00 PM')});

  test('nearest area first by the last hall opened, the rest in order, Charles River last and only when on', () {
    expect(areaOrder(lastHall: null, charlesRiver: false), [0, 1, 2, 3]);
    expect(areaOrder(lastHall: 'W', charlesRiver: false), [1, 0, 2, 3]);
    expect(areaOrder(lastHall: 'F', charlesRiver: false), [0, 1, 2, 3]);
    expect(areaOrder(lastHall: 'H', charlesRiver: false), [3, 0, 1, 2]);
    expect(areaOrder(lastHall: 'B', charlesRiver: true), [3, 0, 1, 2, 4]);
    expect(areaOrder(lastHall: 'W', charlesRiver: true), [1, 0, 2, 3, 4]);
  });

  test('Charles River is absent from the list with the toggle off and last with it on; Terrace is always in', () {
    final off = buildCafes(now: noon, state: Loaded(HoursData(all, null)), openNow: false, charlesRiver: false);
    final on = buildCafes(now: noon, state: Loaded(HoursData(all, null)), openNow: false, charlesRiver: true);
    expect(off.areas.map((a) => a.area), [0, 1, 2, 3]);
    expect(off.areas.expand((a) => a.rows).map((r) => r.place.name), isNot(contains('Charles River Campus')));
    expect(off.areas.expand((a) => a.rows).map((r) => r.place.name), contains('Terrace'));
    expect(on.areas.last.area, 4);
    expect(on.areas.last.rows.single.place.name, 'Charles River Campus');
  });

  test('Open now keeps only the open places; open ones come first, then by name', () {
    final f = feed({
      for (final c in cafeTable) c.title: c.name == 'Wasabi' || c.name == 'Tamales' ? ('08:00 AM', '09:00 PM') : ('08:00 PM', '09:00 PM'),
    });
    final off = buildCafes(now: noon, state: Loaded(HoursData(f, null)), openNow: false, charlesRiver: false);
    final first = off.areas.first.rows.map((r) => r.place.name).toList();
    expect(first.take(2), ['Tamales', 'Wasabi']);
    expect(first.skip(2), [...first.skip(2)]..sort((a, b) => a.toLowerCase().compareTo(b.toLowerCase())));
    final on = buildCafes(now: noon, state: Loaded(HoursData(f, null)), openNow: true, charlesRiver: false);
    expect(on.areas.first.rows.map((r) => r.place.name), ['Tamales', 'Wasabi']);
    expect(on.areas[1].rows, isEmpty); // an area with none open is listed, with its own line
  });

  test('before the hours are known every place of the table is listed with no status and Open now hides nothing', () {
    final v = buildCafes(now: noon, state: Loading<HoursData>(), openNow: true, charlesRiver: false);
    expect(v.areas.expand((a) => a.rows), hasLength(cafeTable.length - 1)); // Charles River is off
    expect(v.areas.expand((a) => a.rows).every((r) => r.status == null), isTrue);
  });

  group('what a café page body is', () {
    final loc = RetailLocationHours(name: 'x');
    test('dishes: one meal has no tab row, several have one', () {
      MenuItem item(MealPeriod m) => MenuItem(dishName: 'd', category: 'c', mealPeriod: m, hallTid: 1, date: '2026-10-08', nutrition: const NutritionFacts(servingSize: '', calories: 0, caloriesFromFat: 0, totalFatG: 0, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 0, totalCarbG: 0, dietaryFiberG: 0, sugarsG: 0, proteinG: 0), allergens: const [], dietTags: const []);
      final one = cafeBody(IntegratedCafeMenu([item(MealPeriod.allday)]));
      expect(one, isA<DishesBody>());
      expect((one as DishesBody).meals, [MealPeriod.allday]);
      expect(one.tabs, isFalse);
      final many = cafeBody(IntegratedCafeMenu([item(MealPeriod.lunch), item(MealPeriod.breakfast), item(MealPeriod.dinner)])) as DishesBody;
      expect(many.meals, [MealPeriod.breakfast, MealPeriod.lunch, MealPeriod.dinner]);
      expect(many.tabs, isTrue);
    });
    test('a names list, a PDF slot, or nothing', () {
      expect(cafeBody(const StandingCafeMenu(RetailMenuItems([RetailMenuItem('a', null)]))), isA<NamesBody>());
      expect(cafeBody(const StandingCafeMenu(RetailMenuPdf(url: 'u', label: 'l'))), isA<PdfBody>());
      expect(cafeBody(const StandingCafeMenu(RetailMenuEmpty())), isA<NoMenuBody>());
      expect(loc.name, 'x');
    });
  });
}
