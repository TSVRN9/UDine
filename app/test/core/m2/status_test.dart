import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/busy.dart';
import 'package:udine/core/m2/status.dart';
import 'support.dart';

void main() {
  final now = board.clock;
  group('statusText at the fixed clock (M2 Halls)', () {
    for (final (k, t) in [('W', 'Open until midnight'), ('F', 'Open until 9 PM'), ('H', 'Open until 9 PM'), ('B', 'Open until midnight')]) {
      test(k, () => expect(statusText(board.hours[k]!, now), t));
    }
    test('says when a closed place opens', () {
      final early = DateTime.parse('2026-10-08T06:00:00-04:00');
      expect(statusText(board.hours['W']!, early), 'Opens 7 AM');
      expect(isOpenNow(board.hours['W']!, early), isFalse);
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
        final v = busyView(busy[h]!);
        expect((v.lamps, v.word, v.extra), (n, word, extra));
      });
    }
  });
  test('Cafés & markets counts: the fixture has 5 places in Southwest (M2 shot-pins.png predates Terrace and shows 4 of 4), all open at the clock', () {
    final counts = [for (var a = 0; a < 4; a++) board.places.where((p) => p.area == a).toList()];
    expect(counts.map((c) => c.length).toList(), [12, 7, 4, 5]);
    expect([for (final c in counts) c.where((p) => isOpenNow(board.hours[p.key]!, now)).length].toList(), [12, 7, 4, 5]);
    expect(board.places.where((p) => p.area == 3).map((p) => p.name), contains('Terrace'));
  });
}
