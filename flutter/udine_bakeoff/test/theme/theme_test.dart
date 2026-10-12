import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/theme/tokens.dart';

void main() {
  test('emphasized matches the RN branch\'s emphasized() at sampled points (values from node)', () {
    final want = {
      0.05: 0.020608488459209744, 0.1: 0.0934798710995109, 0.1666: 0.3993278230644113, 0.2: 0.6357014500047717,
      0.3: 0.8404685666341776, 0.5: 0.9506124624769756, 0.8: 0.994801248796338, 0.95: 0.9997209078606208,
    };
    want.forEach((x, y) => expect(emphasized.transform(x), closeTo(y, 1e-9), reason: 'x=$x'));
  });
  test('colours are M2\'s :root, alpha ones included', () {
    expect(M2Color.dm, const Color(0xFF3B0A0F));
    expect(M2Color.hair, const Color.fromRGBO(36, 23, 26, 0.12));
    expect(M2Color.onDm.a, closeTo(0.8, 1 / 255));
    expect(M2Grade.carbon['B'], (const Color(0xFF9BCB3B), const Color(0xFF3D5C0A)));
  });
  test('type rows carry size, line and weight', () {
    final s = M2Text.bandName.style(M2Color.white);
    expect((s.fontSize, s.height, s.fontFamily, s.fontWeight), (32.0, 1.0, 'Oswald', FontWeight.w600));
    expect(M2Text.hallTitle.line, 55);
  });
}
