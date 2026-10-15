import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/menu_view.dart';
import 'package:udine/shell/prefs.dart';

void main() {
  test('the stored "Only show" tags and Avoid list become the menu\'s Prefs, whatever the tags\' case', () {
    expect(dietPrefs(const [], const []), noPrefs);
    expect(dietPrefs(const ['Milk', 'Eggs'], const ['Vegetarian', 'HALAL']), const Prefs(veg: true, halal: true, avoid: ['Milk', 'Eggs']));
    expect(dietPrefs(const [], const ['vegan']), const Prefs(plant: true));
    expect(dietPrefs(const [], const ['Plant Based']), const Prefs(plant: true));
    expect(dietPrefs(const [], const ['Kosher']), noPrefs); // a tag the menu has no filter for hides nothing
  });
}
