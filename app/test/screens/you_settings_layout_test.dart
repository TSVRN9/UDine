// The settings pages' spacing as M2's CSS fixes it (`.pbody`, `.h3`, `.check`, `.vs`, `.stack`, `.btn`), checked without the DOM measurements
// (m2dom-you2.js holds those; they land in a measure test once the file is in).
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';
import 'you_support.dart';

void main() {
  setUpAll(loadFonts);
  for (final w in [360.0, 390.0]) {
    testWidgets('Dietary preferences: rows 56 tall at the gutter, Only show 8 + 22 under the bar, Avoid 28 under the last row at $w dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: w, route: '/you/diet');
      final bar = t.getRect(find.byType(ScreenHeader));
      expect(t.getTopLeft(find.text('Only show')).dy, closeTo(bar.bottom + M2Layout.pbodyTop + M2Layout.dietTop, 0.5));
      for (final r in find.byType(CheckRow).evaluate()) {
        final rect = t.getRect(find.byWidget(r.widget));
        expect((rect.left, rect.width), (M2Space.gutter, w - 2 * M2Space.gutter));
        expect(rect.height, greaterThanOrEqualTo(M2Layout.areaRowMin));
      }
      expect(t.getTopLeft(find.text('Avoid')).dy, closeTo(t.getRect(find.widgetWithText(CheckRow, 'Halal')).bottom + M2Layout.dietGroupTop, 0.5));
      expect(t.getSize(find.descendant(of: find.widgetWithText(CheckRow, 'Halal'), matching: find.byType(CustomPaint)).last), const Size.square(M2Layout.checkSize));
      await drain(t);
    });

    testWidgets('Which was better?: two 96 tall tiles at the gutter, 12 under the bar body and 12 either side of "or" at $w dp', (t) async {
      final b = await bootYou(t, History.today);
      await openYou(t, b, w: w, route: '/you/rank');
      await until(t, () => find.text('or').evaluate().isNotEmpty);
      final bar = t.getRect(find.byType(ScreenHeader)), tiles = [for (final r in find.byType(Press).evaluate()) t.getRect(find.byWidget(r.widget))].where((r) => r.height >= M2Layout.vsMin).toList();
      expect(tiles, hasLength(2));
      for (final r in tiles) {
        expect((r.left, r.width), (M2Space.gutter, w - 2 * M2Space.gutter));
      }
      expect(tiles[0].top, closeTo(bar.bottom + M2Layout.pbodyTop + M2Layout.vsTop, 0.5));
      final or = t.getRect(find.text('or'));
      expect(or.top - tiles[0].bottom, closeTo(M2Layout.vsGap, 0.5));
      expect(tiles[1].top - or.bottom, closeTo(M2Layout.vsGap, 0.5));
      await drain(t);
    });

    testWidgets('Export: two 52 tall buttons at the gutter, 12 apart, 8 + 12 under the bar at $w dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: w, route: '/you/export');
      final bar = t.getRect(find.byType(ScreenHeader)), a = t.getRect(find.widgetWithText(Button, 'Export JSON')), c = t.getRect(find.widgetWithText(Button, 'Export CSV'));
      expect((a.left, a.width, a.height), (M2Space.gutter, w - 2 * M2Space.gutter, M2Layout.btnL));
      expect((c.left, c.width, c.height), (M2Space.gutter, w - 2 * M2Space.gutter, M2Layout.btnL));
      expect(a.top, closeTo(bar.bottom + M2Layout.pbodyTop + M2Layout.vsTop, 0.5));
      expect(c.top - a.bottom, closeTo(M2Layout.vsGap, 0.5));
      await drain(t);
    });

    testWidgets('You: the choices sit at the gutter, 56 tall, each section 22 under the one above at $w dp', (t) async {
      final b = await bootYou(t);
      await openYou(t, b, w: w);
      await t.ensureVisible(find.text('Show on dishes'));
      for (final s in ['Favorites', 'Dietary preferences', 'Which was better?', 'Export my data']) {
        final rect = t.getRect(find.widgetWithText(LRow, s));
        expect((rect.left, rect.width), (M2Space.gutter, w - 2 * M2Space.gutter));
        expect(rect.height, greaterThanOrEqualTo(M2Layout.areaRowMin));
      }
      expect(t.getTopLeft(find.text('Campus')).dy, closeTo(t.getRect(find.widgetWithText(LRow, 'Export my data')).bottom + M2Layout.secTop, 0.5));
      expect(t.getTopLeft(find.text('Show on dishes')).dy, closeTo(t.getRect(find.widgetWithText(CheckRow, 'Charles River Campus')).bottom + M2Layout.secTop, 0.5));
      await drain(t);
    });
  }
}
