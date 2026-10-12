import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';
import 'harness.dart';

// Each spec state of the hall menu against M2's render of the same state (flows/M2, 390 x 844). Committed goldens draw no photos;
// BAKEOFF_PHOTO_SHOTS=<dir> writes the same screens with them.
Future<void> state(WidgetTester t, String name, {String seed = '', String place = 'W', int day = 0, String? meal, double w = 390, double? scrollTo, Future<void> Function(WidgetTester)? act, bool photos = true}) async {
  sized(t, w: w);
  for (final withPhotos in [false, if (photoShots != null && photos) true]) {
    Photos.enabled = withPhotos;
    final key = GlobalKey();
    final store = freshStore(seed), shell = FakeShell();
    await t.pumpWidget(RepaintBoundary(key: key, child: hallApp(store: store, shell: shell, place: place, day: day, meal: meal, w: w)));
    if (withPhotos) await t.runAsync(() => Future.delayed(const Duration(milliseconds: 600)));
    await t.pumpAndSettle();
    if (scrollTo != null) {
      t.state<ScrollableState>(find.byType(Scrollable).first).position.jumpTo(scrollTo);
      await t.pumpAndSettle();
    }
    await act?.call(t);
    if (!withPhotos) {
      await expectLater(find.byKey(key), matchesGoldenFile('hall_${name}_${w.round()}.png'));
    } else {
      await savePng(t, key, '$photoShots/hall_$name-${w.round()}-photos.png');
    }
  }
}

void main() {
  setUpAll(loadFonts);
  for (final w in [390.0, 360.0]) {
    testWidgets('top at $w', (t) => state(t, 'top', w: w));
    testWidgets('collapsed at $w', (t) => state(t, 'collapsed', w: w, scrollTo: 520));
  }
  testWidgets('dinner tab', (t) => state(t, 'dinner', meal: 'dinner'));
  testWidgets('late night tab', (t) => state(t, 'late', meal: 'late'));
  testWidgets('another day (Mon Oct 12 is day 4; day 3 is Sun)', (t) => state(t, 'day3', day: 3));
  testWidgets('a day with no menu', (t) => state(t, 'emptyday', day: 2));
  testWidgets('Franklin', (t) => state(t, 'franklin', place: 'F'));
  testWidgets('hiding by allergen', (t) => state(t, 'hiding', seed: 'avoid=Milk,Eggs'));
  testWidgets('revealed', (t) => state(t, 'revealed', seed: 'avoid=Milk,Eggs', act: (t) async {
        await t.tap(find.text('Show all'));
        await t.pumpAndSettle();
      }));
  testWidgets('scores: both', (t) => state(t, 'scores_both', seed: 'scores=health,carbon'));
  testWidgets('scores: health', (t) => state(t, 'scores_health', seed: 'scores=health'));
  testWidgets('scores: carbon', (t) => state(t, 'scores_carbon', seed: 'scores=carbon'));
  testWidgets('a one-meal café (Worcester Café)', (t) => state(t, 'cafe_one', place: 'c12'));
  testWidgets('a pinned café (Wasabi)', (t) => state(t, 'cafe_wasabi', place: 'c5'));
}
