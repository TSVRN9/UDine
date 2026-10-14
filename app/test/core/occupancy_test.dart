import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/occupancy.dart';

OccupancyBucket b(String t, int head, int level, [int samples = 6]) =>
    OccupancyBucket.fromJson({'bucket_start': t, 'median_headcount': head, 'median_level': level, 'samples': samples});

const live = SensorLevels(count: 0, notBusy: 300, moderate: 600);
SensorLevels at(int n) => SensorLevels(count: n, notBusy: 300, moderate: 600);
// Wed 2026-10-14 12:10 EDT -> bucket 12:00.
final noon = DateTime.utc(2026, 10, 14, 16, 10);

void main() {
  test('row parses the RPC shape', () {
    final r = b('12:15:00', 480, 1, 5);
    expect((r.minuteOfDay, r.medianHeadcount, r.medianLevel, r.samples), (735, 480, 1, 5));
  });

  test('level inference at the thresholds', () {
    final typical = [b('12:00:00', 400, 1)];
    int lv(int n) => occupancyRead(typical: typical, live: at(n), now: noon)!.level;
    expect([lv(299), lv(300), lv(599), lv(600)], [0, 1, 1, 2]);
  });

  test('null live reading (no sensor / offline) gives no read', () {
    expect(occupancyRead(typical: [b('12:00:00', 400, 1)], live: null, now: noon), isNull);
  });

  test('usuallyClearsAt is the first future bucket below the current level', () {
    final typical = [b('11:45:00', 100, 0), b('12:00:00', 700, 2), b('12:15:00', 650, 2), b('12:30:00', 450, 1), b('12:45:00', 100, 0)];
    final r = occupancyRead(typical: typical, live: at(700), now: noon)!;
    expect(r.usuallyClearsAt, DateTime.utc(2026, 10, 14, 16, 30)); // 12:30 EDT
    expect(r.calmerAt, '12:30');
  });

  test('none today when nothing later is calmer, and the past-midnight rows belong to tomorrow', () {
    final late = DateTime.utc(2026, 10, 15, 3, 50); // Wed 11:50 PM EDT
    final typical = [b('23:30:00', 700, 2), b('23:45:00', 700, 2)];
    expect(occupancyRead(typical: typical, live: at(700), now: late)!.usuallyClearsAt, isNull);
    // 12:30 AM Thu: the Thursday curve's own early buckets can clear.
    final after = DateTime.utc(2026, 10, 15, 4, 30);
    final thu = [b('00:30:00', 700, 2), b('01:00:00', 100, 0)];
    expect(occupancyRead(typical: thu, live: at(700), now: after)!.usuallyClearsAt, DateTime.utc(2026, 10, 15, 5, 0));
  });

  test('a level-0 hall never has a clearing time', () {
    expect(occupancyRead(typical: [b('12:00:00', 0, 0), b('12:15:00', 0, 0)], live: at(10), now: noon)!.usuallyClearsAt, isNull);
  });

  test('low samples in the current or clearing bucket is low confidence and drops calmerAt', () {
    final cur = [b('12:00:00', 700, 2, 3), b('12:30:00', 100, 0)];
    final r1 = occupancyRead(typical: cur, live: at(700), now: noon)!;
    expect(r1.confidence, Confidence.low);
    expect(r1.calmerAt, isNull);
    expect(r1.usuallyClearsAt, isNotNull);
    final far = [b('12:00:00', 700, 2), b('12:30:00', 100, 0, 3)];
    expect(occupancyRead(typical: far, live: at(700), now: noon)!.confidence, Confidence.low);
    final ok = [b('12:00:00', 700, 2, minSamples), b('12:30:00', 100, 0, minSamples)];
    expect(occupancyRead(typical: ok, live: at(700), now: noon)!.confidence, Confidence.good);
  });

  test('no bucket for now: low confidence, no vsUsual', () {
    final r = occupancyRead(typical: const [], live: at(700), now: noon)!;
    expect((r.vsUsual, r.confidence, r.level), (null, Confidence.low, 2));
  });

  test('vsUsual bands: +-25% and at least 10 people', () {
    VsUsual? vs(int n, int med) => occupancyRead(typical: [b('12:00:00', med, 1)], live: at(n), now: noon)!.vsUsual;
    expect([vs(125, 100), vs(124, 100), vs(75, 100), vs(76, 100)], [VsUsual.busier, VsUsual.usual, VsUsual.quieter, VsUsual.usual]);
    expect([vs(9, 0), vs(10, 0), vs(5, 12), vs(0, 10)], [VsUsual.usual, VsUsual.busier, VsUsual.usual, VsUsual.quieter]);
  });

  test('DST: buckets align to Eastern wall time on spring-forward and fall-back days', () {
    final t = [b('11:00:00', 100, 0), b('11:15:00', 700, 2)];
    // Sun 2026-03-08 11:20 EDT = 15:20Z (a fixed -5 offset would read 10:20 and miss).
    final spring = occupancyRead(typical: t, live: at(700), now: DateTime.utc(2026, 3, 8, 15, 20))!;
    expect(spring.vsUsual, VsUsual.usual); // matched the 11:15 bucket (median 700)
    expect(spring.confidence, Confidence.good);
    // Sun 2026-11-01 11:20 EST = 16:20Z (fixed -4 would read 12:20).
    final fall = occupancyRead(typical: [b('11:00:00', 700, 2), b('11:30:00', 0, 0)], live: at(700), now: DateTime.utc(2026, 11, 1, 16, 20))!;
    expect(fall.usuallyClearsAt, DateTime.utc(2026, 11, 1, 16, 30));
    expect(occupancyDow(DateTime.utc(2026, 11, 1, 16, 20)), 0);
    expect(occupancyDow(noon), 3);
  });

  group('meter lamps (owner, 2026-10-14): live headcount against the day\'s typical peak', () {
    int lamps(List<OccupancyBucket> typical, int n) => occupancyRead(typical: typical, live: at(n), now: noon)!.lamps;
    final curve = [b('11:00:00', 100, 0), b('12:00:00', 400, 1), b('13:00:00', 200, 0, 1)];

    test('one lamp per 20% of the peak, at least one', () {
      expect([0, 79, 80, 81, 160, 320, 321, 400].map((n) => lamps(curve, n)), [1, 1, 1, 2, 2, 4, 5, 5]);
    });
    test('capped at the peak', () => expect(lamps(curve, 4000), 5));
    test('the peak is taken over every bucket, low-sample ones included', () {
      final c = [b('12:00:00', 200, 0, 6), b('13:00:00', 1000, 2, 1)];
      expect(lamps(c, 500), 3);
    });
    test('no usable curve falls back to the level: 1, 3 or 5 lamps', () {
      final noRows = <OccupancyBucket>[];
      final thin = [b('12:00:00', 700, 2, 3), b('12:15:00', 700, 2, 1)];
      final zero = [b('12:00:00', 0, 0)];
      for (final c in [noRows, thin, zero]) {
        expect([lamps(c, 10), lamps(c, 300), lamps(c, 600)], [1, 3, 5]);
      }
    });
    test('a thin curve is not trusted for the share: 250 people against a thin peak of 100 is level 0, one lamp, not five', () {
      expect(lamps([b('12:00:00', 100, 0, 1), b('12:15:00', 80, 0, 2)], 250), 1);
      expect(lamps([b('12:00:00', 100, 0, 4)], 250), 5); // one trusted bucket makes the curve usable
    });
    test('low confidence changes the words only, never the meter', () {
      final sure = [b('12:00:00', 400, 1, 6)];
      final unsure = [b('12:00:00', 400, 1, 6), b('12:15:00', 100, 0, 2)];
      expect(occupancyRead(typical: unsure, live: at(300), now: noon)!.lamps, lamps(sure, 300));
    });
  });
}
