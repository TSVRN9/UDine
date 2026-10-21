import 'package:flutter_test/flutter_test.dart';
import 'package:udine/alerts/alerts.dart';

void main() {
  test('a tap with no listener is held for the app to take once; with a listener it is delivered', () async {
    expect(takeHeldTap(), isNull);
    debugTapForTest('Pizza');
    expect(takeHeldTap(), 'Pizza');
    expect(takeHeldTap(), isNull);
    final got = <String>[];
    final sub = alertTaps.stream.listen(got.add);
    debugTapForTest('Tacos');
    await Future<void>.delayed(Duration.zero);
    expect(got, ['Tacos']);
    expect(takeHeldTap(), isNull);
    await sub.cancel();
  });
}
