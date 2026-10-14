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
      for (final l in locs) l['location_title'] as String: ?(l['location_id'] as num?)?.toInt(),
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
              for (final i in s[1] as List) _anchor(dishes[i] as Map<String, dynamic>),
            ].join(),
        },
    });
  }

  static String _anchor(Map<String, dynamic> d) {
    final attrs = [for (final e in d.entries) if (e.key != 'price') ' data-${e.key}="${_esc(e.value as String)}"'].join();
    final price = d['price'] == null ? '' : '<span class="meal-price">${_esc(d['price'] as String)}</span>';
    return '<a$attrs href="#inline">${_esc(d['dish-name'] as String)}</a>$price';
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final u = request.url;
    final body = switch (u.path) {
      '/foodpro-menu-ajax' => () {
        final [m, d, y] = u.queryParameters['date']!.split('/');
        return menuJson(int.parse(u.queryParameters['tid']!), '$y-$m-$d');
      }(),
      '/uapp/get_infov2' => locations,
      '/uapp/get_beacons_events' => events,
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
