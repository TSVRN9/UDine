import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/foodpro.dart' show parseCategoryItems;
import '../../core/search.dart' show matchesQuery;
import '../../core/types.dart' show MealPeriod;
import 'flags.dart';
import 'recorded_client.dart' show RecordedClient;

/// What M2's prototype answers for the packaged groups, behind the HTTP seam so `PackagedSource` and `LookupDishSource` run as they do live.
/// OpenFoodFacts answers the one recorded search (`packaged-2026-10-13.json`, "clif bar") for any query its hits match, and nothing for
/// any other; USDA answers nothing; `lookup-dish` answers from the recorded days a dish is served that are not today or tomorrow (M2
/// `lookupHits`), as `?lookup=` says. `pack=fail` is OFF and USDA not coming back.
class RecordedPackagedClient extends http.BaseClient {
  RecordedPackagedClient({required this.flow, required this.menus, this.lookup = LookupMode.found, this.packFail = false, this.today = '2026-10-08'});
  final Map<String, dynamic> flow, menus;
  final LookupMode lookup;
  final bool packFail;

  /// the first recorded day: a dish served on it or the next is on a menu, so a lookup never names it
  final String today;

  String _json(Object? v) => jsonEncode(v);

  String offSearch(String query) {
    final hits = (flow['search']['hits'] as List).cast<Map<String, dynamic>>();
    bool match(Map<String, dynamic> h) => matchesQuery('${h['product_name']} ${(h['brands'] as List?)?.join(' ') ?? ''}', query);
    return _json({'count': (flow['search']['count'] as num), 'products': [for (final h in hits) if (match(h)) h]});
  }

  /// the dishes later in the 15 days that match, one per name, as `lookup-dish` would send them (a Berkshire dish is `hallTid` 4)
  String lookupJson(String query) {
    switch (lookup) {
      case LookupMode.none:
        return _json({'status': 'miss'});
      case LookupMode.limited:
        return _json({'status': 'rate_limited', 'reason': 'budget_exhausted'});
      case LookupMode.inProgress:
        return _json({'status': 'rate_limited', 'reason': 'in_progress'});
      case LookupMode.fail:
        return 'fail';
      case LookupMode.found:
        break;
    }
    final dishes = menus['dishes'] as List, days = (menus['days'] as Map<String, dynamic>).keys.toList()..sort();
    final skip = days.where((d) => d.compareTo(today) >= 0).take(2).toSet(), seen = <String>{}, out = <Map<String, dynamic>>[];
    const tids = {'Worcester': 1, 'Franklin': 2, 'Hampshire': 3, 'Berkshire': 4};
    for (final d in days) {
      if (skip.contains(d)) continue;
      for (final MapEntry(key: place, value: meals) in ((menus['days'] as Map)[d] as Map).entries) {
        final tid = tids[place];
        if (tid == null) continue;
        for (final stations in (meals as Map).values) {
          for (final s in stations as List) {
            for (final i in s[1] as List) {
              final dish = dishes[i as int] as Map<String, dynamic>, name = dish['dish-name'] as String;
              if (!matchesQuery(name, query) || !seen.add(name.toLowerCase())) continue;
              final m = parseCategoryItems(RecordedClient.anchor(dish), '', MealPeriod.lunch, tid, d).single;
              out.add({'dishName': name, 'location': place, 'hallTid': tid, 'nutrition': m.nutrition.toJson(), 'allergens': m.allergens, 'dietTags': m.dietTags});
            }
          }
        }
      }
    }
    return _json(out.isEmpty ? {'status': 'miss'} : {'status': 'hit', 'candidates': out.take(10).toList()});
  }

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final u = request.url;
    String body;
    var status = 200;
    if (u.host.endsWith('openfoodfacts.org')) {
      body = packFail ? 'fail' : offSearch(u.queryParameters['search_terms'] ?? '');
      if (packFail) status = 500;
    } else if (u.host == 'api.nal.usda.gov') {
      body = packFail ? 'fail' : _json({'foods': [], 'currentPage': 1, 'totalPages': 1});
      if (packFail) status = 500;
    } else if (u.path.endsWith('/functions/v1/lookup-dish')) {
      body = lookupJson((jsonDecode((request as http.Request).body) as Map)['query'] as String);
      if (lookup == LookupMode.fail) status = 500;
    } else {
      throw StateError('no recording for $u');
    }
    return http.StreamedResponse(Stream.value(utf8.encode(body)), status, request: request);
  }
}
