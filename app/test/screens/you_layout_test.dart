// You's spacing as M2's CSS fixes it (`.yhead`, `.sec`, `.lrow`, `.pbody`, `.prow`, `.lgone`), checked without the DOM measurements
// (test/screens/m2_you_measure_test.dart holds those until the file is in).
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/plate/plate_row.dart';
import 'package:udine/screens/you/you_parts.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);
  for (final w in [360.0, 390.0]) {
    testWidgets('You: sections 20 in from the edge, Today 20 under the header, Meals 22 under the totals, rows 56 tall at $w dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: w);
      final head = t.getRect(find.byType(ScreenHeader)), facts = t.getRect(find.byType(Facts));
      expect(t.getTopLeft(find.text('Today')).dy, closeTo(head.bottom + M2Layout.todayTop, 0.5));
      expect((facts.left, facts.width), (M2Space.gutter, w - 2 * M2Space.gutter));
      expect(t.getTopLeft(find.text('Meals')).dy, closeTo(facts.bottom + M2Layout.secTop, 0.5));
      for (final r in find.byType(LRow).evaluate()) {
        final rect = t.getRect(find.byWidget(r.widget));
        expect((rect.left, rect.width), (M2Space.gutter, w - 2 * M2Space.gutter));
        expect(rect.height, greaterThanOrEqualTo(M2Layout.areaRowMin));
      }
      await drain(t);
    });

    testWidgets('a day: its sections sit 40 in (`.pbody` 20 and `.sec` 20), 8 + 20 under the bar at $w dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: w, route: '/you/day/2026-10-07');
      final bar = t.getRect(find.byType(ScreenHeader)), facts = t.getRect(find.byType(Facts));
      expect(facts.top, closeTo(bar.bottom + M2Layout.pbodyTop + M2Layout.todayTop, 0.5));
      expect((facts.left, facts.width), (M2Layout.pageSecInset, w - 2 * M2Layout.pageSecInset));
      expect(t.getTopLeft(find.text('Meals')).dy, closeTo(facts.bottom + M2Layout.secTop, 0.5));
      await drain(t);
    });

    testWidgets('a meal sheet: rows 64 tall at the gutter, the Removed row 64 tall, in the same place at $w dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: w, route: '/you/day/2026-10-07');
      await t.tap(find.text('Lunch at Worcester'));
      await t.pumpAndSettle();
      for (final r in find.byType(PlateRow).evaluate()) {
        final rect = t.getRect(find.byWidget(r.widget));
        expect((rect.left, rect.width), (M2Space.gutter, w - 2 * M2Space.gutter));
        expect(rect.height, greaterThanOrEqualTo(M2Layout.prowMin));
      }
      final first = t.getRect(find.byType(PlateRow).first);
      final row = find.byType(PlateRow).first;
      for (var i = 0; i < 2; i++) {
        await t.tap(find.descendant(of: row, matching: find.bySemanticsLabel('Less')));
        await wrote(t);
      }
      final gone = t.getRect(find.byType(GoneRow));
      expect(gone.height, greaterThanOrEqualTo(M2Layout.lgoneMin));
      expect(gone.top, closeTo(t.getRect(find.byType(PlateRow).last).bottom, 0.5));
      expect(first.top, closeTo(t.getRect(find.byType(PlateRow).first).top, 0.5)); // the rest has closed up under the same title
      await drain(t);
    });
  }
}
