// The shell layer's polish: the plate bar above the keyboard (M2 NOTES "Keyboard and Log"), one sheet per double tap, the keyboard put
// away when Search is left, and a sheet that is modal for TalkBack.
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/dish/dish_sheet.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/plate/plate_bar.dart';
import 'package:udine/screens/plate/plate_sheet.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import '../screens/dish_support.dart';
import '../screens/search_screen_test.dart' show finish, openSearch, settle;
import '../screens/support.dart';

void main() {
  setUpAll(loadFonts);

  testWidgets('with the keyboard up the plate bar sits above it and the tab bar is gone', (t) async {
    final boot = await bootRecorded(t);
    await t.runAsync(() => boot.seedPlate('/plate?seed=one'));
    await openApp(t, boot, route: '/search');
    await settle(t);
    expect(find.byType(M2TabBar), findsOneWidget);
    const kb = 300.0;
    t.view.viewInsets = const FakeViewPadding(bottom: kb);
    addTearDown(t.view.resetViewInsets);
    await settle(t);
    expect(find.byType(M2TabBar), findsNothing);
    final bar = find.descendant(of: find.byType(PlateSheet), matching: find.byType(PlateBar));
    expect(t.getBottomLeft(bar).dy, lessThanOrEqualTo(t.view.physicalSize.height / t.view.devicePixelRatio - kb));
    await finish(t);
  });

  testWidgets('two rapid taps on a dish row leave one dish sheet', (t) async {
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
    final row = find.byType(DishRow).first;
    await t.tap(row, warnIfMissed: false);
    await t.tap(row, warnIfMissed: false);
    await t.pump();
    expect(find.byType(DishSheet), findsOneWidget);
    await sheetUp(t);
    await drain(t);
  });

  testWidgets('switching away from Search puts the keyboard away', (t) async {
    await openSearch(t);
    await t.tap(find.text('Halls'));
    await settle(t);
    await t.tap(find.text('Search'));
    await settle(t);
    final field = t.widget<EditableText>(find.byType(EditableText)).focusNode;
    expect(field.hasFocus, isTrue);
    await t.tap(find.text('Halls'));
    await settle(t);
    expect(field.hasFocus, isFalse);
    await finish(t);
  });

  testWidgets('under an open sheet the page and the tab bar are out of the semantics tree', (t) async {
    final h = t.ensureSemantics();
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
    expect(find.semantics.byLabel('Search'), findsOneWidget); // the tab bar
    final name = t.widget<DishRow>(find.byType(DishRow).first).dish.dishName;
    await t.tap(find.byType(DishRow).first, warnIfMissed: false);
    await t.pump();
    await sheetUp(t);
    expect(find.semantics.byLabel('Search'), findsNothing);
    expect(find.semantics.byLabel(RegExp(name)), findsWidgets); // (the sheet's own)
    expect(t.getSemantics(find.byType(DishSheet)).label, contains(name));
    h.dispose();
    await drain(t);
  });
}
