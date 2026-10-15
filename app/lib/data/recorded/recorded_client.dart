import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'flags.dart';

String _esc(String s) =>
    s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#039;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/// UMass's feeds answered from M2's recordings, so UmassSource and the parsers run exactly as they do live.
/// [menus] is menus-2026-10-08-to-22.json (`dishes` + `days[day][place][meal] = [[station, [dish idx]]]`),
/// [locations] the get_infov2 capture, [events] get_beacons_events.
class RecordedClient extends http.BaseClient {
  RecordedClient({required this.menus, required this.locations, required this.events}) {
    final locs = jsonDecode(locations) as List;
    // Halls are keyed Worcester/Franklin/Hampshire/Berkshire in the recording; their location ids are the foodpro tids.
    _ids = {
      'Worcester': 1, 'Franklin': 2, 'Hampshire': 3, 'Berkshire': 4,
      for (final l in locs)
        if (l['location_id'] != null) l['location_title'] as String: (l['location_id'] as num).toInt(),
    };
  }
  final Map<String, dynamic> menus;
  final String locations, events;
  late final Map<String, int> _ids;

  /// ponytail: one MenuItem-shaped HTML fragment per station; Procrastination Station has no location id in get_infov2, so it has no menu.
  String menuJson(int id, String isoDay) {
    final dishes = menus['dishes'] as List;
    final place = ((menus['days'] as Map)[isoDay] as Map? ?? {}).entries.where((e) => _ids[e.key] == id).firstOrNull?.value as Map?;
    return jsonEncode({
      for (final MapEntry(key: meal, value: stations) in (place ?? {}).entries)
        meal: {
          for (final s in stations as List)
            s[0] as String: [
              for (final i in s[1] as List) anchor(dishes[i] as Map<String, dynamic>),
            ].join(),
        },
    });
  }

  /// One dish as the feed's `<a data-*>` anchor (plus the retail price span).
  static String anchor(Map<String, dynamic> d) {
    final attrs = [for (final e in d.entries) if (e.key != 'price') ' data-${e.key}="${_esc(e.value as String)}"'].join();
    final price = d['price'] == null ? '' : '<span class="meal-price">${_esc(d['price'] as String)}</span>';
    return '<a$attrs href="#inline">${_esc(d['dish-name'] as String)}</a>$price';
  }

  /// M2's busy simulation (src.html BUSY/TYPICAL, Thursday 12:41), per hall location id: [live] headcount now and the typical day as M2's own
  /// `TYPICAL[h]` = [first hour, pct per hour]. Thresholds are 300/600 for all, so levels follow from counts: Worcester busy, usual, calmer
  /// 13:30, good; Franklin a little busy, low confidence; Hampshire not busy, quieter, good; Berkshire busy, busier, low confidence.
  /// ponytail: M2's pct is a share of capacity and its TYPICAL disagrees with its own calmer_at (Worcester's 12:45 is already under 600), so the
  /// headcount is pct x `scale` and [clearsAt] pins Worcester's last busy bucket; pct, usual_pct and the outlook have no OccupancyRead field.
  static const _sim = {
    1: (scale: 10, live: 700, start: 7, pct: [15, 25, 30, 22, 30, 62, 86, 70, 40, 30, 45, 70, 82, 60, 40, 30, 22], samples: 6, clearsAt: 13 * 60 + 30),
    2: (scale: 8, live: 400, start: 7, pct: [12, 20, 22, 18, 30, 55, 50, 30, 20, 25, 45, 55, 35, 20], samples: 2, clearsAt: 0),
    3: (scale: 8, live: 150, start: 7, pct: [10, 18, 20, 16, 28, 44, 40, 25, 18, 22, 40, 48, 30, 18], samples: 6, clearsAt: 0),
    4: (scale: 8, live: 750, start: 11, pct: [45, 74, 70, 45, 30, 40, 72, 84, 70, 50, 40, 45, 38], samples: 2, clearsAt: 0),
  };

  /// get_infov2 with the four halls' headcount triple replaced by the simulation.
  static String simulateLive(String locations) {
    final list = jsonDecode(locations) as List;
    for (final l in list.cast<Map<String, dynamic>>()) {
      final sim = _sim[l['location_id']];
      if (sim != null) {
        l['business_level'] = sim.live;
        l['notbusy_level'] = 300;
        l['moderate_level'] = 600;
      }
    }
    return jsonEncode(list);
  }

  /// Stand-in for `rpc/occupancy_typical`, shaped per hall by [_sim]: each hour's pct is the headcount of its four 15-minute buckets, falling
  /// toward the next hour's when that is lower (so the hour's highest bucket is its pct). Other locations get Worcester's.
  static String typicalCurveJson(int locationId) {
    final s = _sim[locationId] ?? _sim[1]!;
    return jsonEncode([
      for (var i = 0; i < s.pct.length; i++)
        for (var q = 0; q < 4; q++)
          () {
            final m = (s.start + i) * 60 + q * 15, v = s.pct[i], next = i + 1 < s.pct.length ? s.pct[i + 1] : v;
            final n = ((v + (next < v ? (next - v) * q / 4 : 0)) * s.scale).round();
            final level = n >= 600 ? 2 : n >= 300 ? 1 : 0;
            return {
              'bucket_start': '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}:00',
              'median_headcount': n,
              'median_level': s.clearsAt > 0 ? (m >= 11 * 60 && m < s.clearsAt ? 2 : level > 1 ? 1 : level) : level,
              'samples': s.samples,
            };
          }(),
    ]);
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final u = request.url;
    final body = switch (u.path) {
      '/foodpro-menu-ajax' => () {
        final [m, d, y] = u.queryParameters['date']!.split('/');
        return menuJson(int.parse(u.queryParameters['tid']!), '$y-$m-$d');
      }(),
      '/uapp/get_infov2' => simulateLive(locations),
      '/uapp/get_beacons_events' => events,
      '/rest/v1/rpc/occupancy_typical' => typicalCurveJson((jsonDecode((request as http.Request).body) as Map)['p_location_id'] as int),
      '/rest/v1/dishes' => '[]', // the recorded screens don't read the catalog
      _ => throw StateError('no recording for $u'),
    };
    return http.StreamedResponse(Stream.value(utf8.encode(body)), 200, request: request);
  }
}

/// The bake-off's net.dart behaviour in front of any client. Switchable, so offline can warm its cache first.
class NetClient extends http.BaseClient {
  NetClient(this.inner, this.mode, this.slow);
  final http.Client inner;
  NetMode mode;
  final Duration slow;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    switch (mode) {
      case NetMode.ok:
        break;
      case NetMode.slow:
        await Future<void>.delayed(slow);
      case NetMode.offline:
        throw const SocketException('Network is unreachable');
      case NetMode.fail:
        return http.StreamedResponse(Stream.value(utf8.encode('fail')), 500, request: request);
    }
    return inner.send(request);
  }
}
