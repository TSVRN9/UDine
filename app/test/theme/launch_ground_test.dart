import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/theme/tokens.dart';

void main() {
  test('the Android launch window is Halls\' maroon (M2 --dm), not the default white, in every theme', () {
    final hex = RegExp(r'launch_ground">#([0-9A-Fa-f]{8})<').firstMatch(File('android/app/src/main/res/values/colors.xml').readAsStringSync())![1]!;
    expect(int.parse(hex, radix: 16), M2Color.dm.toARGB32());
    for (final f in ['values/styles.xml', 'values-night/styles.xml', 'values-v31/styles.xml', 'drawable/launch_background.xml', 'drawable-v21/launch_background.xml']) {
      final s = File('android/app/src/main/res/$f').readAsStringSync();
      expect(s, contains('launch_ground'), reason: f);
      expect(s, isNot(contains('@android:color/white')), reason: f);
    }
  });
}
