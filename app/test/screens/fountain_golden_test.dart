import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/screens/hall/hall_menu.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'dish_support.dart';
import 'support.dart';

// M2 R12d at 360 and 390 dp: Worcester's lunch scrolled to Beverages, and the Fountain Drink's sheet. Photos are UMass's: the ground shows maroon.
void main() {
  setUpAll(loadFonts);
  for (final w in [360.0, 390.0]) {
    final n = w.toInt();
    Future<void> toRow(WidgetTester t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch', w: w);
      final sc = t.state<ScrollableState>(find.descendant(of: find.byType(HallMenu), matching: find.byType(Scrollable)).first);
      for (var i = 0; i < 5; i++) {
        sc.position.jumpTo(sc.position.maxScrollExtent);
        await t.pumpAndSettle();
      }
    }

    testWidgets('Beverages, the last station, $n dp', (t) async {
      await toRow(t);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/fountain_menu_$n.png'));
      await drain(t);
    });
    testWidgets('the Fountain Drink sheet, $n dp', (t) async {
      await toRow(t);
      await t.tap(find.widgetWithText(ListRow, 'Fountain Drink'));
      await sheetUp(t);
      await expectLater(find.byType(UdineApp), matchesGoldenFile('../goldens/fountain_sheet_$n.png'));
      await drain(t);
    });
  }
}
