// A saved food's "12 ozl" (the feed's string, kept in the store) reads "12 fl oz" in Your foods and on the food's sheet.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/boot.dart';
import 'package:udine/core/packaged_food.dart';
import 'package:udine/core/saved_food.dart';
import 'package:udine/core/types.dart';
import 'package:udine/screens/dish/food_sheet.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish;
import 'support.dart';
import 'you_support.dart';

Future<Boot> withSoda(WidgetTester t) async {
  final boot = await bootRecorded(t);
  const n = NutritionFacts(servingSize: '12 ozl', calories: 150, caloriesFromFat: 0, totalFatG: 0, satFatG: 0, transFatG: 0, cholesterolMg: 0, sodiumMg: 45, totalCarbG: 39, dietaryFiberG: 0, sugarsG: 39, proteinG: 0);
  await t.runAsync(() => boot.foods!.save(SavedFood.packed(PackagedFood(source: OffSource(barcode: '1', productName: 'Cola'), productName: 'Cola', brand: 'Acme', nutrition: n, allergens: const [], ingredients: 'water'))));
  return boot;
}

void main() {
  setUpAll(loadFonts);

  testWidgets('Your foods: the row\'s line reads 12 fl oz, never ozl', (t) async {
    await openYou(t, await withSoda(t), route: '/you/foods');
    expect(find.textContaining('12 fl oz'), findsOneWidget);
    expect(find.textContaining('ozl'), findsNothing);
    await finish(t);
  });

  testWidgets('a saved food\'s sheet: the serving line reads 12 fl oz, never ozl', (t) async {
    await openYou(t, await withSoda(t), route: '/you/foods');
    await t.tap(find.textContaining('Cola').first);
    await until(t, () => find.byType(FoodSheet).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    final sheet = find.byType(FoodSheet);
    expect(find.descendant(of: sheet, matching: find.text('12 fl oz')), findsNWidgets(2)); // the line under the name and the label's Serving size row
    expect(find.descendant(of: sheet, matching: find.textContaining('ozl')), findsNothing);
    await finish(t);
  });
}
