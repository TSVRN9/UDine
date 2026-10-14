import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';

void main() {
  setUpAll(loadFonts);
  testWidgets('the label\'s rows are the heights M2 draws for a full label (title, serving, Calories, 2 thin, rows, sub rows, foot)', (t) async {
    const label = Label('1 thigh (6 oz)', '240', [
      LabelRow(LabelKind.thin, '', '', '', 'Fat cal. 100'),
      LabelRow(LabelKind.thin, '', '', '', '% Daily Value*'),
      LabelRow(LabelKind.row, 'Total Fat 11g', 'Total Fat', '11g', '14%'),
      LabelRow(LabelKind.sub, 'Saturated Fat 3g', 'Saturated Fat', '3g', '15%'),
      LabelRow(LabelKind.sub, 'Trans Fat 0g', 'Trans Fat', '0g', ''),
      LabelRow(LabelKind.row, 'Cholesterol 90mg', 'Cholesterol', '90mg', '30%'),
      LabelRow(LabelKind.row, 'Sodium 600mg', 'Sodium', '600mg', '26%'),
      LabelRow(LabelKind.row, 'Total Carbohydrate 9g', 'Total Carbohydrate', '9g', '3%'),
      LabelRow(LabelKind.sub, 'Dietary Fiber 1g', 'Dietary Fiber', '1g', '4%'),
      LabelRow(LabelKind.sub, 'Total Sugars 7g', 'Total Sugars', '7g', ''),
      LabelRow(LabelKind.row, 'Protein 28g', 'Protein', '28g', '56%', last: true),
    ]);
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(Directionality(textDirection: TextDirection.ltr, child: Align(alignment: Alignment.topLeft, child: SizedBox(width: 350, child: NutritionLabel(label: label)))));
    final column = t.renderObject<RenderFlex>(find.descendant(of: find.byType(NutritionLabel), matching: find.byType(Column)).first);
    final got = <double>[];
    for (var c = column.firstChild; c != null; c = (c.parentData! as ContainerBoxParentData<RenderBox>).nextSibling) {
      got.add(c.size.height);
    }
    // M2's DOM (Playwright, flows/M2 built page, 390 wide): .lt .ls .cal, thin x2, 34 for a row with a %DV, 28 for one without, last 40, .lf 24.2
    const want = [40.0, 37, 54, 26, 26, 34, 34, 28, 34, 34, 34, 34, 28, 40, 24.2];
    expect(got.length, want.length);
    for (var i = 0; i < want.length; i++) {
      expect(got[i], closeTo(want[i], 0.3), reason: 'child $i'); // (Flutter rounds a line to whole dp: the 12 dp foot is 24, M2's 24.2)
    }
    expect(t.getSize(find.byType(NutritionLabel)).height, closeTo(521.2, 1.5)); // M2's .label box
  });
}
