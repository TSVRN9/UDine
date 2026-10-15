import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/core/m2/where.dart';
import 'support.dart';

DateTime at(String hhmm) => DateTime.parse('2026-10-08T$hhmm:00-04:00');

void main() {
  group('whereAnswer matches M2', () {
    for (final v in vectors['where'] as List) {
      final newton = (v as Map).containsKey('newton');
      test('${v['dish']} @ ${v['clock']}${newton ? ' (Charles River on)' : ''}', () {
        final got = whereAnswer(board, v['dish'], DateTime.parse(v['clock']), newton: newton);
        expect(got.map((g) => g.toJson()).toList(), v['answer']);
        expect([for (var i = 0; i < got.length; i++) whenText(got[i], i > 0 ? got[i - 1] : null)], v['text']);
      });
    }
  });

  test('a hall whose Grab \'N Go window is not known (the live feed names only the place being viewed) is left out, not a crash', () {
    final bare = Board(clock: board.clock, places: board.places, hours: board.hours, grab: const {}, days: board.days, events: board.events);
    final dish = [for (final st in board.days[today]!.values.expand((p) => [?p['grab']]).first) ...st.dishes].first.dishName;
    expect(() => whereAnswer(bare, dish, board.clock), returnsNormally);
  });

  test('leaves Charles River servings out while the toggle is off', () {
    final now = DateTime.parse(vectors['clock']);
    final on = whereAnswer(board, 'Chorizo Jalapeno Quesadilla', now, newton: true);
    expect(on.expand((g) => g.halls), contains('c28'));
    expect(whereAnswer(board, 'Chorizo Jalapeno Quesadilla', now).expand((g) => g.halls), isNot(contains('c28')));
  });

  test('never answers "now" from a window that ended at 4:30 PM (Review Focus 2)', () {
    final late = (vectors['where'] as List).where((v) => (v['clock'] as String).contains('T16:31')).toList();
    expect(late, isNotEmpty);
    for (final v in late) {
      final got = whereAnswer(board, v['dish'], DateTime.parse(v['clock']), newton: (v as Map).containsKey('newton'));
      expect(got.where((g) => g.st == 'now' && g.close == '4:30 PM'), isEmpty);
    }
    final d = (vectors['where'] as List).firstWhere((v) =>
        (v['clock'] as String).contains('T12:41') &&
        (v['answer'] as List).every((g) => g['meal'] == 'lunch' && g['st'] == 'now' && g['close'] == '4:30 PM'));
    final after = whereAnswer(board, d['dish'], at('16:31'));
    expect(after.every((g) => g.st != 'now' || g.close != '4:30 PM'), isTrue);
  });

  test('a window is over at its close minute, not a minute after', () {
    final d = (vectors['where'] as List).firstWhere((v) => (v['answer'] as List).any((g) => g['st'] == 'now' && g['close'] == '4:30 PM'));
    List<WhereGroup> nowGroups(String hhmm) =>
        whereAnswer(board, d['dish'], at(hhmm)).where((g) => g.st == 'now' && g.close == '4:30 PM').toList();
    expect(nowGroups('16:29'), isNotEmpty);
    expect(nowGroups('16:30'), isEmpty);
  });

  test('a window is open from its open minute, not a minute after', () {
    String? st(String hhmm) => whereAnswer(board, 'Golden BBQ Chicken Thigh', at(hhmm)).where((g) => g.meal == 'lunch' && g.open == '11:00 AM').firstOrNull?.st;
    expect(st('10:59'), 'later');
    expect(st('11:00'), 'now');
  });

  test('the instant is read as Eastern wall time whatever zone it is expressed in', () {
    final a = whereAnswer(board, 'Golden BBQ Chicken Thigh', DateTime.parse('2026-10-08T12:41:00-04:00'));
    final b = whereAnswer(board, 'Golden BBQ Chicken Thigh', DateTime.parse('2026-10-08T16:41:00Z'));
    expect(b.map((g) => g.toJson()).toList(), a.map((g) => g.toJson()).toList());
  });
}
