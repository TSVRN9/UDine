// Flutter's equivalent of RN's bake-off lint rule (mobile/eslint.config.js): colours, durations, curves, type and layout sizes
// come from lib/theme/tokens.dart, not from the screens, the motion or the kit.
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';

final _num = RegExp(r'(?<![\[\w.])[1-9]\d*(\.\d+)?(?![\]\w])|(?<![\[\w.])0\.\d+');
final _computedDuration = RegExp(r'Duration\(milliseconds: (\(ms|.*M2Motion\.)');

/// The offending lines of a source file. `strict`: screens and motion also ban type and layout literals.
List<String> violations(String src, {required bool strict}) {
  final out = <String>[];
  final lines = src.split('\n');
  for (var i = 0; i < lines.length; i++) {
    final line = lines[i].replaceFirst(RegExp(r'//.*$'), '');
    void flag(String why) => out.add('line ${i + 1}: $why: ${line.trim()}');
    if (line.contains('Color(0x')) flag('raw colour');
    if (line.contains('Duration(') && !_computedDuration.hasMatch(line)) flag('raw duration');
    if (!strict) continue;
    if (line.contains('Colors.')) flag('Colors.*');
    if (line.contains('Curves.')) flag('Curves.*');
    if (line.contains('fontSize:')) flag('raw font size');
    for (final m in RegExp(r'EdgeInsets\.\w+\(([^)]*)\)').allMatches(line)) {
      if (_num.hasMatch(m[1]!)) flag('numeric EdgeInsets');
    }
    if (RegExp(r'SizedBox\((?:width|height): *[1-9]').hasMatch(line)) flag('numeric SizedBox');
  }
  return out;
}

void main() {
  group('the checker itself', () {
    test('flags a raw colour in the kit', () => expect(violations("const Color(0xD13B0A0F),", strict: false), hasLength(1)));
    test('flags a raw duration but not a token or computed one', () {
      expect(violations('Duration(milliseconds: 240)', strict: false), hasLength(1));
      expect(violations('Duration(milliseconds: M2Motion.settleD)', strict: false), isEmpty);
      expect(violations('Duration(milliseconds: (ms * x).round())', strict: false), isEmpty);
    });
    test('flags numeric sizes in screens, not token reads or list indexes', () {
      expect(violations('padding: EdgeInsets.only(top: 12),', strict: true), hasLength(1));
      expect(violations('const SizedBox(height: 7)', strict: true), hasLength(1));
      expect(violations('EdgeInsets.fromLTRB(M2Space.s[4], M2Layout.x, M2Space.s[4], 0)', strict: true), isEmpty);
      expect(violations('Colors.red, Curves.ease, fontSize: 14', strict: true), hasLength(3));
    });
  });

  for (final (dir, strict) in [('lib/screens', true), ('lib/motion', true), ('lib/ui', false)]) {
    test('$dir has no raw literals the tokens own', () {
      final bad = <String>[];
      for (final f in Directory(dir).listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
        if (f.path.endsWith('letter_paths.dart')) continue; // generated outlines
        bad.addAll(violations(f.readAsStringSync(), strict: strict).map((v) => '${f.path} $v'));
      }
      expect(bad, isEmpty);
    });
  }
}
