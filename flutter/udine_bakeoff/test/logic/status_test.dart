import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/busy.dart';
import 'package:udine_bakeoff/logic/hours.dart';
import 'package:udine_bakeoff/logic/status.dart';
import 'support.dart';

void main() {
  final now = toEastern(DateTime.parse(fx.clock));
  group('statusText at the fixed clock (M2 Halls)', () {
    for (final (k, t) in [('W', 'Open until midnight'), ('F', 'Open until 9 PM'), ('H', 'Open until 9 PM'), ('B', 'Open until midnight')]) {
      test(k, () => expect(statusText(fx.hours[k]!, now), t));
    }
    test('says when a closed place opens', () {
      final early = DateTime.utc(now.year, now.month, now.day, 6);
      expect(statusText(fx.hours['W']!, early), 'Opens 7 AM');
      expect(isOpenNow(fx.hours['W']!, early), isFalse);
    });
  });
  group('busyView (M2 busyRow)', () {
    test('lamps: ceil(pct/20), at least one', () => expect([0, 1, 20, 21, 82, 100].map(lamps).toList(), [1, 1, 1, 2, 5, 5]));
    for (final (h, n, word, extra) in [
      ('W', 5, 'Busy', 'Calmer around 1:30 PM'),
      ('F', 3, 'Probably a little busy', ''),
      ('H', 2, 'Not busy', 'Quieter than usual'),
      ('B', 5, 'Probably busy', 'Busier than usual'),
    ]) {
      test('$h: $n lamps, $word', () {
        final v = busyView(fx.busy[h]!);
        expect((v.lamps, v.word, v.extra), (n, word, extra));
      });
    }
  });
}
