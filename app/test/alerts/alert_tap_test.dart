import 'package:flutter_test/flutter_test.dart';
import 'package:udine/alerts/alerts.dart';

void main() {
  test('a tap with no listener is held for the app to take once; with a listener it is delivered', () async {
    expect(takeHeldTap(), isNull);
    debugTapForTest('/hall/worcester?dish=A');
    expect(takeHeldTap(), '/hall/worcester?dish=A');
    expect(takeHeldTap(), isNull);
    final got = <String>[];
    final sub = alertTaps.stream.listen(got.add);
    debugTapForTest('/hall/worcester?dish=B');
    await Future<void>.delayed(Duration.zero);
    expect(got, ['/hall/worcester?dish=B']);
    expect(takeHeldTap(), isNull);
    await sub.cancel();
  });
}
