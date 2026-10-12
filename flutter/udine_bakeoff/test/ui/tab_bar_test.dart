import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/theme/tokens.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import '../fonts.dart';

void main() {
  setUpAll(loadFonts);
  Widget app(int sel) => Directionality(textDirection: TextDirection.ltr, child: Align(alignment: Alignment.bottomLeft, child: SizedBox(width: 390, child: M2TabBar(selected: sel, onSelect: (_) {}))));
  Finder bar() => find.descendant(of: find.byKey(const ValueKey('tab-indicator')), matching: find.byType(ColoredBox));

  testWidgets('M2 .tbar .ind: 3 px maroon, a third of the bar, over the hairline, on the active tab', (tester) async {
    await tester.pumpWidget(app(0));
    final r = tester.getRect(bar());
    final barTop = tester.getTopLeft(find.byType(M2TabBar)).dy;
    expect((r.left, r.width, r.height), (0.0, 130.0, 3.0));
    expect(r.top, barTop); // the bar's own top edge: it covers the 1 px hairline
    expect(tester.widget<ColoredBox>(bar()).color, M2Color.vm);
  });

  testWidgets('it slides to the selected tab over settle (200 ms), not at once', (tester) async {
    await tester.pumpWidget(app(0));
    await tester.pumpWidget(app(2));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    final mid = tester.getRect(bar()).left;
    expect(mid, inExclusiveRange(10, 250));
    await tester.pump(const Duration(milliseconds: 120));
    expect(tester.getRect(bar()).left, 260.0);
  });
}
