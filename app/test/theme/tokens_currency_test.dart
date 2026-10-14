// The token file is generated from ../design-tokens/m2.json; this fails when lib/theme/m2_tokens.g.dart is not what the generator prints,
// and when the JSON's `normal` line heights are not what Flutter measures for the bundled fonts.
import 'dart:convert';
import 'dart:io';
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/theme/tokens.dart';
import '../../tool/gen_tokens.dart';
import '../fonts.dart';

void main() {
  setUpAll(loadFonts);
  final json = jsonDecode(File('../design-tokens/m2.json').readAsStringSync()) as Map<String, dynamic>;

  test('lib/theme/m2_tokens.g.dart is what tool/gen_tokens.dart prints for ../design-tokens/m2.json (run `dart run tool/gen_tokens.dart`)', () {
    expect(File('lib/theme/m2_tokens.g.dart').readAsStringSync(), generate(json));
  });

  test('every type row with `line: normal` has no fixed height, and every other row has its line', () {
    final rows = (json['type'] as Map).cast<String, Map>();
    final mine = {
      'status': M2Text.status, 'statusSm': M2Text.statusSm, 'stationHead': M2Text.stationHead, 'metaNum': M2Text.metaNum,
      'rowName': M2Text.rowName, 'note': M2Text.note, 'dishName': M2Text.dishName,
    };
    mine.forEach((k, v) => expect(v.line, rows[k]!['line'] == 'normal' ? isNull : rows[k]!['line'], reason: k));
  });

  test('M2FontMetrics.normalLine is the height Flutter draws for each bundled family (JSON "normal")', () {
    M2FontMetrics.normalLine.forEach((family, ratio) {
      final p = TextPainter(text: TextSpan(text: 'Hxg', style: TextStyle(fontFamily: family, fontSize: 100, fontWeight: FontWeight.w500)), textDirection: TextDirection.ltr)..layout();
      expect(p.height / 100, closeTo(ratio, 0.006), reason: family);
    });
  });
}
