import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/ui/search_field.dart';
import '../fonts.dart';

void main() {
  setUpAll(loadFonts);

  // Search focuses its field on open, so the first keyboard never needed a tap; after the back key hides it the field keeps
  // focus, and a tap anywhere on the 52 dp field must bring it back, not only on the one text line inside it.
  testWidgets('a tap anywhere on the field brings the keyboard back after it was dismissed', (tester) async {
    final c = TextEditingController(), f = FocusNode();
    await tester.pumpWidget(Directionality(
      textDirection: TextDirection.ltr,
      child: Center(child: SizedBox(width: 358, child: SearchField(controller: c, focus: f, hint: 'Search lunch at every hall', onChanged: (_) {}, onClear: () {}))),
    ));
    final field = tester.getRect(find.byType(SearchField));
    for (final at in [field.topCenter + const Offset(0, 4), field.centerLeft + const Offset(8, 0), field.center]) {
      f.requestFocus();
      await tester.pump();
      expect(tester.testTextInput.isVisible, isTrue);
      tester.testTextInput.hide();
      expect(tester.testTextInput.isVisible, isFalse);
      expect(f.hasFocus, isTrue, reason: 'the back key hides the keyboard but leaves focus');
      await tester.tapAt(at);
      await tester.pump(const Duration(milliseconds: 400));
      expect(tester.testTextInput.isVisible, isTrue, reason: 'tap at $at');
    }
  });

  testWidgets('a tap still places the caret, and the × still clears', (tester) async {
    final c = TextEditingController(text: 'pizza'), f = FocusNode();
    var cleared = 0;
    await tester.pumpWidget(Directionality(
      textDirection: TextDirection.ltr,
      child: Center(child: SizedBox(width: 358, child: SearchField(controller: c, focus: f, hint: '', onChanged: (_) {}, onClear: () => cleared++))),
    ));
    await tester.tapAt(tester.getTopLeft(find.byType(EditableText)) + const Offset(1, 10));
    await tester.pump(const Duration(milliseconds: 400));
    expect((f.hasFocus, c.selection.baseOffset), (true, 0));
    await tester.tap(find.bySemanticsLabel('Clear'));
    await tester.pump(const Duration(milliseconds: 400));
    expect((cleared, c.selection.baseOffset), (1, 0));
  });
}
