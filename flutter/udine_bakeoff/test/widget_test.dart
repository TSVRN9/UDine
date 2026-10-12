import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/fixture.dart';
import 'package:udine_bakeoff/main.dart';
import 'package:udine_bakeoff/ui/ui.dart';
import 'fonts.dart';

void main() {
  setUpAll(loadFonts);
  testWidgets('the app boots from the bundled fixture to the Halls tab', (tester) async {
    Photos.enabled = false;
    final raw = (await tester.runAsync(() => rootBundle.loadString('assets/fixture.json')))!;
    final fx = Fixture.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    await tester.pumpWidget(BakeoffApp(fx: fx));
    expect(find.text('Lunch'), findsOneWidget);
    expect(find.text('Worcester'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
