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

  /// M2's busy simulation (src.html BUSY/TYPICAL, Thursday 12:41), per hall location id: [live] headcount now, [peak] the typical
  /// headcount over [from, to), [samples] per bucket. Thresholds are 300/600 for all, so levels follow from counts:
  /// Worcester busy, usual, calmer 13:30, good; Franklin a little busy, low confidence; Hampshire not busy, quieter, good;
  /// Berkshire busy, busier, low confidence. ponytail: pct, usual_pct and the outlook board have no OccupancyRead field.
  static const _sim = {
    1: (live: 700, peak: 680, from: 11 * 60, to: 13 * 60 + 30, shoulder: 450, shoulderTo: 14 * 60 + 30, samples: 6),
    2: (live: 400, peak: 400, from: 11 * 60, to: 15 * 60, shoulder: 100, shoulderTo: 15 * 60, samples: 2),
    3: (live: 150, peak: 450, from: 11 * 60, to: 14 * 60, shoulder: 100, shoulderTo: 14 * 60, samples: 6),
    4: (live: 750, peak: 500, from: 11 * 60, to: 14 * 60, shoulder: 100, shoulderTo: 14 * 60, samples: 2),
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

  /// Stand-in for `rpc/occupancy_typical`, shaped per hall by [_sim]; other locations get Worcester's.
  static String typicalCurveJson(int locationId) {
    final s = _sim[locationId] ?? _sim[1]!;
    return jsonEncode([
      for (var m = 7 * 60; m < 22 * 60; m += 15)
        () {
          final n = m >= s.from && m < s.to ? s.peak : m >= s.to && m < s.shoulderTo ? s.shoulder : 100;
          return {
            'bucket_start': '${(m ~/ 60).toString().padLeft(2, '0')}:${(m % 60).toString().padLeft(2, '0')}:00',
            'median_headcount': n,
            'median_level': n >= 600 ? 2 : n >= 300 ? 1 : 0,
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
