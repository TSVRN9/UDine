// The debug-only /kit route shows every kit widget (the screenshot path's first subject), at 360 and 390 dp.
import 'dart:io';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/app.dart';
import 'package:udine/dev/kit_gallery.dart';
import 'package:udine/ui/ui.dart';
import 'fonts.dart';

void main() {
  setUpAll(loadFonts);
  final shown = <Type>[
    ScreenHeader, Band, BandGrade, Arrive, SheetGrab, RatingsPanel, BusyRow, Meter, ListRow, LRow, CheckRow, Button, TextAction, CustomButton, Stepper, AddButton, PlusMinus, RowControl,
    ScoreBadge, Badge, MarkPatch, MarkGlyph, HallChip, HallLetter, Chevron, BackButton, Spinner, NutritionLabel, Facts, SheetOption, M2TabBar, Felt, FilterChipButton, PinButton, Thumb, FavoriteStar, StarMark, HallTags, SearchField, CustomFoodButton, PlaceRow, VariantPicker, SettleFade,
  ];

  for (final w in [360.0, 390.0]) {
    testWidgets('/kit at $w dp builds every kit widget and matches its golden', (t) async {
      t.view.physicalSize = Size(w, 2200);
      t.view.devicePixelRatio = 1;
      addTearDown(t.view.reset);
      await t.pumpWidget(const UdineApp(initialRoute: '/kit'));
      await t.pump(const Duration(seconds: 1));
      for (final type in shown) {
        expect(find.byType(type, skipOffstage: false), findsWidgets, reason: '$type');
      }
      await expectLater(find.byType(UdineApp), matchesGoldenFile('goldens/kit_${w.toInt()}.png'));
    });
  }

  testWidgets('a release build has no /kit', (t) async {
    await t.pumpWidget(const UdineApp(initialRoute: '/kit', release: true));
    await t.pump(const Duration(seconds: 1));
    expect(find.byType(KitGallery), findsNothing);
  });

  test('every widget the kit exports is on the gallery', () {
    final exported = RegExp(r'^(?:class|abstract class) ([A-Z]\w*) extends (?:StatelessWidget|StatefulWidget)', multiLine: true);
    final names = <String>{};
    for (final f in Directory('lib/ui').listSync().whereType<File>()) {
      names.addAll(exported.allMatches(f.readAsStringSync()).map((m) => m[1]!));
    }
    final onGallery = shown.map((t) => t.toString()).toSet();
    // wrappers and sheet internals: Press, NegMargin, BaselineAt, PatchLetter (inside HallChip and HallTags); Photo needs a bundled photo; M2Sheet is a modal (sheet_test.dart)
    const internal = {'Press', 'Photo', 'NegMargin', 'BaselineAt', 'M2Sheet', 'PatchLetter'};
    expect(names.difference(onGallery).difference(internal), isEmpty);
  });
}
