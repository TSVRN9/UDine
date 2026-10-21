import 'package:flutter/semantics.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/screens/hall/dish_row.dart';
import '../fonts.dart';
import 'support.dart';

/// Every visible node that can be tapped, as TalkBack would land on it.
List<SemanticsData> tappable(WidgetTester t) {
  final out = <SemanticsData>[];
  void walk(SemanticsNode n) {
    final d = n.getSemanticsData();
    if (!d.flagsCollection.isHidden && d.hasAction(SemanticsAction.tap)) out.add(d);
    n.visitChildren((c) { walk(c); return true; });
  }
  // ignore: deprecated_member_use
  walk(t.binding.pipelineOwner.semanticsOwner!.rootSemanticsNode!);
  return out;
}

void main() {
  setUpAll(loadFonts);

  testWidgets('Halls home: one labelled, tappable node per band and per tab, no unlabelled clickable twin', (t) async {
    final h = t.ensureSemantics();
    await openApp(t, await bootRecorded(t));
    await until(t, () => find.text('Open until midnight').evaluate().isNotEmpty);
    final nodes = tappable(t);
    expect(nodes.where((d) => d.label.isEmpty), isEmpty, reason: nodes.map((d) => d.label).toString());
    for (final n in ['Worcester', 'Franklin', 'Hampshire', 'Berkshire', 'Halls', 'Search', 'You']) {
      expect(nodes.where((d) => d.label.startsWith(n)), hasLength(1), reason: n);
    }
    await drain(t);
    h.dispose();
  });

  testWidgets('a dish row is one labelled, tappable node', (t) async {
    final h = t.ensureSemantics();
    await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch');
    await until(t, () => find.byType(DishRow).evaluate().isNotEmpty);
    await t.pumpAndSettle();
    final nodes = tappable(t);
    expect(nodes.where((d) => d.label.isEmpty), isEmpty, reason: nodes.map((d) => d.label).toString());
    await drain(t);
    h.dispose();
  });
}
