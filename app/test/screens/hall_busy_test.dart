// The hall header's busy parts (`flutter-port-hall-menu` Task 3): lamps are the live headcount against today's typical peak, the board is
// the usual headcount per hour, the words come from the hour's level, and "Calmer around" only when the curve is sure of it.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/occupancy.dart';
import 'package:udine/screens/hall/busy.dart';
import 'package:udine/screens/hall/hall_header.dart';
import 'package:udine/theme/tokens.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

OccupancyBucket b(String t, int head, int level, [int samples = 6]) =>
    OccupancyBucket.fromJson({'bucket_start': t, 'median_headcount': head, 'median_level': level, 'samples': samples});

final noon = DateTime.utc(2026, 10, 14, 16, 10); // Wed 12:10 EDT
HallBusyView view(List<OccupancyBucket> typical, int n) => HallBusyView.of(occupancyRead(typical: typical, live: SensorLevels(count: n, notBusy: 300, moderate: 600), now: noon)!);

final _dom = jsonDecode(File('test/m2_dom.json').readAsStringSync()) as Map<String, dynamic>;

List<double> rect(WidgetTester t, Finder f) {
  final x = t.getRect(f.first);
  return [x.left, x.top, x.width, x.height];
}

int lit(WidgetTester t) => t.widget<Meter>(find.byType(Meter)).lit;

void main() {
  setUpAll(loadFonts);

  group('HallBusyView', () {
    final curve = [b('11:00:00', 100, 0), b('12:00:00', 500, 1), b('12:30:00', 100, 0), b('13:00:00', 200, 0)];
    test('every lamp count, one per 20% of the peak', () {
      expect([0, 100, 101, 200, 201, 300, 301, 400, 401, 500, 900].map((n) => view(curve, n).lamps), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
    });
    test('the word is the hour\'s level, and "Calmer around" leads when there is a clearing time', () {
      final v = view(curve, 700);
      expect((v.word, v.extra), ('Busy', 'Calmer around 12:30 PM'));
      expect(view(curve, 320).word, 'A little busy');
      expect(view(curve, 20).word, 'Not busy');
    });
    test('without a clearing time vsUsual says busier or quieter', () {
      final flat = [b('12:00:00', 400, 1)];
      expect(view(flat, 500).extra, 'Busier than usual');
      expect(view(flat, 310).extra, '');
      expect(view([b('12:00:00', 400, 1)], 20).extra, 'Quieter than usual');
    });
    test('no usable curve: level lamps 1, 3, 5 and no board', () {
      for (final c in [<OccupancyBucket>[], [b('12:00:00', 700, 2, 3)], [b('12:00:00', 0, 0)]]) {
        expect([view(c, 10), view(c, 300), view(c, 600)].map((v) => (v.lamps, v.board)), [(1, null), (3, null), (5, null)]);
      }
    });
    test('low confidence changes only the words: hedged, no clearing time, same lamps and board', () {
      final sure = [b('12:00:00', 700, 2), b('12:30:00', 100, 0)], unsure = [b('12:00:00', 700, 2), b('12:30:00', 100, 0, 2)];
      final a = view(sure, 700), c = view(unsure, 700);
      expect((a.word, a.extra), ('Busy', 'Calmer around 12:30 PM'));
      expect((c.word, c.extra), ('Probably busy', ''));
      expect(c.lamps, a.lamps);
      expect(c.board, a.board);
    });
  });

  for (final w in [360.0, 390.0]) {
    final n = w.toInt();

    testWidgets('header: every lamp count, the board and the extra line at $n dp', (t) async {
      Photos.enabled = false;
      phone(t, w: w);
      final busy = ValueNotifier<HallBusyView?>(null);
      await t.pumpWidget(Directionality(
        textDirection: TextDirection.ltr,
        child: MediaQuery(
          data: MediaQueryData(size: Size(w, 844)),
          child: Align(alignment: Alignment.topLeft, child: HallHeader(place: 'W', name: 'Worcester', top: 24, status: ValueNotifier('Open until midnight'), progress: kAlwaysCompleteAnimation, scroll: ValueNotifier(0), dayFade: kAlwaysCompleteAnimation, busy: busy)),
        ),
      ));
      expect(find.byType(BusyBoard), findsNothing);
      final curve = [b('11:00:00', 100, 0), b('12:00:00', 500, 1), b('12:30:00', 100, 0)];
      for (final (people, want) in [(50, 1), (150, 2), (250, 3), (350, 4), (450, 5)]) {
        busy.value = view(curve, people);
        await t.pump();
        expect(lit(t), want, reason: '$people of 500');
      }
      busy.value = view(curve, 700);
      await t.pump();
      expect(find.text('Calmer around 12:30 PM'), findsOneWidget);
      final head = (_dom['$n'] as Map<String, dynamic>)['head'] as Map<String, dynamic>;
      final board = rect(t, find.byType(BusyBoard)), want = (head['mhist'] as List).cast<num>();
      for (var i = 0; i < 4; i++) {
        expect(board[i], closeTo(want[i].toDouble(), 1), reason: 'mhist[$i] ours $board, M2 $want at $n dp');
      }
      final bz = rect(t, find.byType(BusyRow)), wb = (head['mbz'] as List).cast<num>();
      expect([bz[0], bz[1] + M2Layout.busyTopHeader, bz[2], bz[3] - M2Layout.busyTopHeader].map((x) => x.round()), wb.map((x) => x.round()));
      busy.value = view([b('12:00:00', 400, 1, 2)], 400); // no usable curve: no board, no extra
      await t.pump();
      expect((find.byType(BusyBoard).evaluate().length, lit(t), find.text('A little busy').evaluate().length), (0, 3, 0));
      expect(find.text('Probably a little busy'), findsOneWidget);
    });

    // M2's per-hall busy at 12:41 (src.html BUSY), over the recorded simulation: lamps and words, the board where the curve is usable.
    for (final (slug, lamps, word, extra, board) in [
      ('worcester', 5, 'Busy', 'Calmer around 1:30 PM', true),
      ('franklin', 3, 'Probably a little busy', '', false),
      ('hampshire', 2, 'Not busy', 'Quieter than usual', true),
      ('berkshire', 5, 'Probably busy', 'Busier than usual', false),
    ]) {
      testWidgets('$slug at 12:41 reads $lamps lamps, "$word" at $n dp', (t) async {
        await openHall(t, await bootRecorded(t), '/hall/$slug?meal=lunch', w: w);
        await until(t, () => find.byType(Meter).evaluate().isNotEmpty && lit(t) > 0); // (the invisible room holds a lamp-less meter)
        expect((lit(t), find.text(word).evaluate().length, extra.isEmpty || find.text(extra).evaluate().length == 1, find.byType(BusyBoard).evaluate().length), (lamps, 1, true, board ? 1 : 0));
        await drain(t);
      });
    }

    testWidgets('another day keeps the room and draws nothing at $n dp', (t) async {
      await openHall(t, await bootRecorded(t), '/hall/worcester?meal=lunch&day=2026-10-12', w: w);
      expect((find.text('Calmer around 1:30 PM').hitTestable().evaluate().length, find.byType(BusyBoard).evaluate().length), (0, 0));
      await drain(t);
    });
  }
}
