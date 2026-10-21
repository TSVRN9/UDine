import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/dish_row.dart';
import 'package:udine/screens/hall/meal_tabs.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

/// Big text must grow or shrink to fit, never lie over its neighbour or leave its box (text scale 1.3 and 2.0).
void main() {
  setUpAll(loadFonts);

  /// every painted line of text under [root], as it lands on the screen
  List<Rect> texts(WidgetTester t, Finder root) => [
        for (final e in find.descendant(of: root, matching: find.byType(RichText)).evaluate())
          if ((e.renderObject! as RenderParagraph).text.toPlainText().trim().isNotEmpty) t.getRect(find.byWidget(e.widget)),
      ];
  void apart(List<Rect> rs, String what) {
    for (var i = 0; i < rs.length; i++) {
      for (var j = i + 1; j < rs.length; j++) {
        final o = rs[i].intersect(rs[j]);
        expect(o.width > 0.5 && o.height > 0.5, isFalse, reason: '$what: ${rs[i]} overlaps ${rs[j]}');
      }
    }
  }
  void inside(List<Rect> rs, Rect box, String what) {
    for (final r in rs) {
      expect(box.inflate(0.5).contains(r.topLeft) && box.inflate(0.5).contains(r.bottomRight), isTrue, reason: '$what: $r leaves $box');
    }
  }

  for (final k in [1.3, 2.0]) {
    testWidgets('Halls home at text scale $k: header, bands and tab bar hold their text apart and inside', (t) async {
      t.platformDispatcher.textScaleFactorTestValue = k;
      addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
      await openApp(t, await bootRecorded(t));
      await until(t, () => find.byType(Meter).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      final head = find.byType(ScreenHeader).first;
      expect(MediaQuery.textScalerOf(t.element(head)).scale(1), k);
      apart(texts(t, head), 'header');
      inside(texts(t, head), t.getRect(head), 'header');
      for (final b in find.byType(Band).evaluate()) {
        final f = find.byWidget(b.widget), box = t.getRect(f);
        apart(texts(t, f), 'band');
        inside(texts(t, f), box, 'band');
        for (final m in find.descendant(of: f, matching: find.byType(Meter)).evaluate()) {
          final mr = t.getRect(find.byWidget(m.widget));
          inside([mr], box, 'band meter');
          apart([mr, ...texts(t, f)], 'band meter');
        }
      }
      final bar = find.byType(M2TabBar);
      apart(texts(t, bar), 'tab bar');
      inside(texts(t, bar), t.getRect(bar), 'tab bar');
      await drain(t);
    });

    testWidgets('a hall page at text scale $k: meal tabs, station row and the busy lines hold apart', (t) async {
      t.platformDispatcher.textScaleFactorTestValue = k;
      addTearDown(t.platformDispatcher.clearTextScaleFactorTestValue);
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
      final tabs = find.byType(MealTabs);
      expect(MediaQuery.textScalerOf(t.element(tabs)).scale(1), k);
      apart(texts(t, tabs), 'meal tabs');
      inside(texts(t, tabs), t.getRect(tabs), 'meal tabs');
      for (final r in texts(t, tabs)) {
        expect(r.width, greaterThan(0));
      }
      final head = find.byKey(const ValueKey('fade-title')).first;
      expect(head, findsOneWidget);
      final meters = find.byType(Meter);
      if (meters.evaluate().isNotEmpty) {
        final m = t.getRect(meters.first);
        final busy = find.ancestor(of: meters.first, matching: find.byType(BusyRow));
        apart([m, ...[for (final r in texts(t, busy)) r]], 'busy row');
      }
      expect(find.byType(DishRow), findsWidgets);
      await drain(t);
    });
  }
}
