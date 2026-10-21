import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';

void main() {
  setUpAll(loadFonts);

  for (final k in [1.0, 1.3, 2.0]) {
    testWidgets('the last word of a name with a patch is as big as the rest at text scale $k', (t) async {
      final style = M2Text.rowName.style(M2Color.ink);
      await t.pumpWidget(Directionality(
        textDirection: TextDirection.ltr,
        child: MediaQuery(
          data: MediaQueryData(textScaler: TextScaler.linear(k)),
          child: Column(children: [
            Text.rich(Badge.name('Posole Posole', style, badge: const Badge(Glyph.plant, label: 'Plant based')), key: const ValueKey('a')),
            Text('Posole', style: style, key: const ValueKey('b')),
          ]),
        ),
      ));
      final a = find.descendant(of: find.byKey(const ValueKey('a')), matching: find.text('Posole')), b = find.byKey(const ValueKey('b'));
      expect(t.getRect(a).height, closeTo(t.getRect(b).height, 0.5));
    });
  }
}
