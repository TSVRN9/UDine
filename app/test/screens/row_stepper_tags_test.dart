// A Search row's stepper never paints over the hall tiles riding its meta line (search-beta-fixes Task 2), at qty 1 and 2, and the row keeps its height.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'search_screen_test.dart' show finish, settle;
import 'support.dart';

void main() {
  setUpAll(loadFonts);
  for (final w in [320, 360, 390]) {
    testWidgets('the stepper clears the hall tiles at $w dp, qty 1 and 2, and the row does not move', (t) async {
      await openApp(t, await bootRecorded(t), route: '/search?q=chicken', w: w.toDouble());
      await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
      await finish(t);
      FocusManager.instance.primaryFocus?.unfocus();
      await settle(t);
      final row = find.ancestor(of: find.byType(HallTags).first, matching: find.byType(DishRow)).first;
      final h = t.getSize(row).height;
      for (final q in [1, 2]) {
        await t.tap(find.descendant(of: row, matching: q == 1 ? find.byType(AddButton) : find.bySemanticsLabel('More')).first);
        await settle(t);
        final tiles = t.getRect(find.descendant(of: row, matching: find.byType(HallTags))), step = t.getRect(find.descendant(of: row, matching: find.byType(Stepper)));
        expect(tiles.overlaps(step), isFalse, reason: 'qty $q: tiles $tiles under the stepper $step');
        expect(t.getSize(row).height, h, reason: 'qty $q: the row keeps its height');
      }
      await finish(t);
    });
  }
}
