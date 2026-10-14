import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/hours.dart';
import 'package:udine/core/occupancy.dart';
import 'package:udine/core/types.dart' show DiningHoursFeed;
import 'package:udine/data/recorded/recorded_client.dart';
import 'package:udine/data/repository.dart';
import 'package:udine/screens/halls/halls_model.dart';
import 'package:udine/data/recorded/recorded.dart';
import 'support.dart';

// The recorded capture with M2's busy simulation laid over the four halls (RecordedClient.simulateLive), read the way Repository does.
late final List<Map<String, dynamic>> _locations;
late final DiningHoursFeed feed;
late final Map<String, SensorLevels> live;
HoursData hours({bool busy = true}) => HoursData(feed, busy ? live : null);

Map<String, OccupancyRead> reads() => {
      for (final l in _locations)
        if (parseSensorLevels(l) case final s?)
          if (l['location_id'] case final int id)
            if (id <= 4)
              l['location_title'] as String: occupancyRead(
                typical: [for (final b in jsonDecode(RecordedClient.typicalCurveJson(id)) as List) OccupancyBucket.fromJson(b as Map<String, dynamic>)],
                live: s, now: lunch,
              )!,
    };

HallsVM vm(DataState<HoursData> s, {List<String> pins = const [], bool cr = false, DateTime? now, Map<String, OccupancyRead>? r}) =>
    buildHalls(now: now ?? lunch, state: s, reads: r ?? reads(), pins: pins, charlesRiver: cr);

void main() {
  setUpAll(() async {
    _locations = [for (final l in jsonDecode(RecordedClient.simulateLive(await recordedLocations(readRecorded))) as List) l as Map<String, dynamic>];
    feed = mapInfoV2(_locations);
    live = {for (final l in _locations) l['location_title'] as String: ?parseSensorLevels(l)};
  });
  test('the date line and the meal read Eastern wall time', () {
    final v = vm(Loaded(hours()));
    expect((v.date, v.title), ('Thursday, October 8', 'Lunch'));
  });

  group('busy meter (owner, 2026-10-14)', () {
    late final HallsVM v;
    setUpAll(() => v = vm(Loaded(hours())));
    BandVM h(String k) => v.halls.firstWhere((b) => b.key == k);
    test('lamps are the headcount against the day\'s peak; thin curves fall back to the level', () {
      // Worcester 700 of 680: capped, 5. Franklin: every bucket has 2 samples, so its level (a little busy) gives 3. Hampshire 150 of 450: 2.
      // Berkshire: thin curve again, level busy: 5.
      expect([for (final k in ['W', 'F', 'H', 'B']) h(k).lamps], [5, 3, 2, 5]);
    });
    test('the word is the level for this hour, hedged when the curve is thin', () {
      expect([for (final k in ['W', 'F', 'H', 'B']) h(k).word], ['Busy', 'Probably a little busy', 'Not busy', 'Probably busy']);
    });
  });

  group('network states (CONCEPT R9 §4)', () {
    test('loading: the rack is whole, names and letters only, nothing on the date line', () {
      for (final s in [Loading<HoursData>(), StillLoading<HoursData>()]) {
        final v = vm(s);
        expect([for (final b in v.halls) b.name], ['Worcester', 'Franklin', 'Hampshire', 'Berkshire']);
        expect(v.halls.every((b) => b.status == null && b.lamps == null), isTrue);
        expect((v.line, v.retry, v.hoursKnown, v.areas.every((a) => a.count == null)), (NetLine.none, false, false, true));
      }
    });
    test('loaded: statuses and meters', () {
      final v = vm(Loaded(hours()));
      expect(v.halls.map((b) => b.status), everyElement(isNotNull));
      expect((v.line, v.liveKnown), (NetLine.none, true));
    });
    test('the saved copy before the live one: statuses, and no meter yet (busy is never shown stale)', () {
      final v = vm(Loaded(hours(busy: false)));
      expect(v.halls.map((b) => b.status), everyElement(isNotNull));
      expect(v.halls.map((b) => b.lamps), everyElement(isNull));
    });
    test('offline: cached statuses, no busy, "You\'re offline" and no button', () {
      final v = vm(LoadedOffline(hours(busy: false)));
      expect((v.line, v.retry, v.hoursKnown), (NetLine.offline, false, true));
      expect(v.halls.map((b) => b.lamps), everyElement(isNull));
    });
    test('offline with nothing saved: "You\'re offline" with Try again, names only', () {
      final v = vm(NotSaved<HoursData>());
      expect((v.line, v.retry, v.hoursKnown), (NetLine.offline, true, false));
      expect(v.halls.map((b) => b.status), everyElement(isNull));
    });
    test('failed: "Couldn\'t connect", Try again, names and letters only', () {
      final v = vm(Failed<HoursData>('x'));
      expect((v.line, v.retry), (NetLine.failed, true));
      expect(v.halls.map((b) => b.status), everyElement(isNull));
    });
  });

  group('pins and areas', () {
    test('pins keep the order pinned and drop what is unknown', () {
      final v = vm(Loaded(hours()), pins: ['Tamales', 'Wasabi', 'Nowhere']);
      expect(v.pins.map((b) => b.name), ['Tamales', 'Wasabi']);
      expect(v.pins.every((b) => b.lamps == null && b.isCafe), isTrue);
    });
    test('area rows say "N of M open now" once the hours are known', () {
      final v = vm(Loaded(hours()));
      expect(v.areas.map((a) => a.name), ['Campus Center', 'North, by Worcester', 'Library and academic core', 'Southwest, by Hampshire and Berkshire']);
      expect(v.areas.map((a) => a.count), ['12 of 12 open now', '7 of 7 open now', '4 of 4 open now', '5 of 5 open now']);
    });
    test('a hall closed for the day says so', () {
      final v = vm(Loaded(hours()), now: easternInstant(DateTime.utc(2026, 10, 8, 23, 59, 30)));
      expect(v.halls.map((b) => b.status), everyElement('Closed for today'));
    });
  });

  group('the Charles River filter reaches pins and area rows', () {
    late final HallsVM on, off;
    setUpAll(() {
      on = vm(Loaded(hours()), pins: ['Charles River Campus', 'Terrace'], cr: true);
      off = vm(Loaded(hours()), pins: ['Charles River Campus', 'Terrace'], cr: false);
    });
    test('off: no pin, no area row, no count', () {
      expect(off.pins.map((b) => b.name), ['Terrace']);
      expect(off.areas, hasLength(4));
      expect(off.areas.map((a) => a.name), isNot(contains('Charles River Campus, Newton')));
    });
    test('on: the pin and the last area row are back, counted', () {
      expect(on.pins.map((b) => b.name), ['Charles River Campus', 'Terrace']);
      expect(on.areas.last.name, 'Charles River Campus, Newton');
      expect(on.areas.last.count, '1 of 1 open now');
    });
    test('the southwest count includes Terrace either way', () {
      expect(off.areas[3].count, on.areas[3].count);
    });
  });
}
