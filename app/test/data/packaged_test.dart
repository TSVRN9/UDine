// Packaged-food mapping against shared/vectors/packaged.json (the TS clients' output), the recorded 2026-10-13 OFF flow
// for the Packaged group's rules, and the three clients over a fake http.Client. No network.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:udine/data/packaged.dart';
import 'package:udine/data/source.dart';

const _flow =
    '../docs/design/explorations/2026-10-ui-overhaul/flows/packaged-2026-10-13.json';
Map<String, dynamic> flow() =>
    jsonDecode(File(_flow).readAsStringSync()) as Map<String, dynamic>;

Object? wire(Object? v) => jsonDecode(jsonEncode(v));

/// A mapped food in the vector file's shape: the source's id key, then nutrition (+ ingredients/allergens when set).
Map<String, dynamic> vectorShape(PackagedFood f) {
  final s = f.source.toJson()..remove('type');
  return {
    ...s,
    'nutrition': f.nutrition.toJson(),
    if (f.ingredients != null) 'ingredients': f.ingredients,
    if (f.allergens != null) 'allergens': f.allergens,
  };
}

void main() {
  final doc =
      jsonDecode(File('../shared/vectors/packaged.json').readAsStringSync())
          as Map<String, dynamic>;
  group('packaged.json', () {
    for (final c in doc['cases'] as List) {
      test('${c['kind']}: ${c['name']}', () {
        final i = c['input'] as Map<String, dynamic>;
        final Object? got = switch (c['kind']) {
          'off_search' => () {
            final p = mapOffSearch(i['response'], page: i['page'] ?? 1);
            return {
              'results': [for (final f in p.results) vectorShape(f)],
              'hasMore': p.hasMore,
            };
          }(),
          'off_product' => () {
            final f = mapOffProduct(i['barcode'], i['response']);
            return f == null
                ? null
                : {...vectorShape(f), 'servingSize': f.nutrition.servingSize};
          }(),
          'usda_search' => () {
            final p = mapUsdaSearch(i['response'], page: i['page'] ?? 1);
            return {
              'results': [for (final f in p.results) vectorShape(f)],
              'hasMore': p.hasMore,
            };
          }(),
          final k => throw StateError('unknown kind $k'),
        };
        expect(wire(got), c['expected']);
      });
    }
  });

  group('Packaged group', () {
    List<PackagedFood> recorded() {
      final hits = (flow()['search']['hits'] as List)
          .cast<Map<String, dynamic>>();
      return mapOffSearch({'count': 10000, 'products': hits}).results;
    }

    test(
      'drops hits with no calories and repeated names (case-insensitive), keeps order',
      () {
        final all = recorded();
        expect(all, hasLength(20));
        final g = packagedGroup(all);
        expect(g, hasLength(14));
        expect(g.first.displayName, 'Clif bar');
        expect(g.first.nutrition.calories, closeTo(367.647, 0.001));
        expect(g.every((f) => f.nutrition.calories > 0), isTrue);
        final names = g.map((f) => f.displayName.toLowerCase()).toList();
        expect(names.toSet(), hasLength(names.length));
      },
    );

    test(
      'a name that lacks its brand leads with it; one that has it does not',
      () {
        final p = mapOffProduct('0722252068484', {
          'status': 1,
          'product': flow()['product'],
        })!;
        expect(p.productName, 'Chocolate Chip');
        expect(p.displayName, 'Clif Bar Chocolate Chip');
        expect(recorded()[5].displayName, 'Clif Bar Chocolate Chip');
      },
    );

    test('brands: a list or a comma string, first one, trimmed', () {
      PackagedFood f(Object brands) => mapOffSearch({
        'products': [
          {
            'code': '1',
            'product_name': 'Bar',
            'brands': brands,
            'nutriments': {'energy-kcal_100g': 1},
          },
        ],
      }).results.single;
      expect(f(['  Acme Co', 'Other']).displayName, 'Acme Co Bar');
      expect(f(' Acme Co, Other').displayName, 'Acme Co Bar');
      expect(f('').displayName, 'Bar');
      expect(f(<String>[]).displayName, 'Bar');
    });

    test('a food already in Your foods is not repeated', () {
      final g = packagedGroup(recorded(), have: {'clif bar duos'});
      expect(g, hasLength(13));
      expect(g.map((f) => f.displayName), isNot(contains('Clif Bar Duos')));
    });

    test('OFF then USDA: the same name from USDA is dropped', () {
      final usda = mapUsdaSearch({
        'foods': [
          {
            'fdcId': 1,
            'description': 'clif BAR',
            'foodNutrients': [
              {'nutrientName': 'Energy', 'unitName': 'KCAL', 'value': 400},
            ],
          },
          {
            'fdcId': 2,
            'description': 'Oats',
            'foodNutrients': [
              {'nutrientName': 'Energy', 'unitName': 'KCAL', 'value': 380},
            ],
          },
        ],
      }).results;
      final g = packagedGroup([...recorded(), ...usda]);
      expect(g, hasLength(15));
      expect(g.last.displayName, 'Oats');
    });
  });

  group('PackagedSource', () {
    late List<http.Request> seen;
    late int fail503;
    PackagedSource src({String usdaKey = ''}) => PackagedSource(
      MockClient((req) async {
        seen.add(req);
        if (req.url.host == 'world.openfoodfacts.org' && fail503 > 0) {
          fail503--;
          return http.Response('', 503);
        }
        return http.Response(
          jsonEncode(
            req.url.host == 'api.nal.usda.gov'
                ? {'foods': [], 'currentPage': 1, 'totalPages': 1}
                : {'count': 0, 'products': []},
          ),
          200,
        );
      }),
      usdaKey: usdaKey,
      retryDelay: Duration.zero,
    );
    setUp(() {
      seen = [];
      fail503 = 0;
    });

    test(
      'OFF search: the cgi/search.pl url RN calls, plus brands, with the UDine user agent',
      () async {
        await src().offSearch('clif bar', page: 2);
        final u = seen.single.url;
        expect(
          '${u.scheme}://${u.host}${u.path}',
          'https://world.openfoodfacts.org/cgi/search.pl',
        );
        expect(u.queryParameters, {
          'search_terms': 'clif bar',
          'search_simple': '1',
          'action': 'process',
          'json': '1',
          'page': '2',
          'page_size': '20',
          'fields':
              'code,product_name,serving_size,nutriments,ingredients_text,allergens_tags,brands',
        });
        expect(
          seen.single.headers['User-Agent'],
          'UDine/1.0 (+https://github.com/TSVRN9/UDine)',
        );
      },
    );

    test('OFF retries a 503 once, then gives up with BadStatus', () async {
      fail503 = 1;
      await src().offSearch('x');
      expect(seen, hasLength(2));
      seen.clear();
      fail503 = 2;
      await expectLater(
        src().offSearch('x'),
        throwsA(isA<BadStatus>().having((e) => e.status, 'status', 503)),
      );
      expect(seen, hasLength(2));
    });

    test('OFF product: the api/v2 url; status 0 is null', () async {
      final s = PackagedSource(
        MockClient((req) async {
          seen.add(req);
          return http.Response(jsonEncode({'status': 0}), 200);
        }),
        retryDelay: Duration.zero,
      );
      expect(await s.offProduct('0722 252'), isNull);
      expect(
        seen.single.url.toString(),
        'https://world.openfoodfacts.org/api/v2/product/0722%20252.json',
      );
    });

    test(
      'USDA: generic and branded urls; the key falls back to DEMO_KEY, a given key is used',
      () async {
        await src().usdaGeneric('apple');
        await src().usdaBranded('clif bar', page: 3);
        await src(usdaKey: 'k3y').usdaGeneric('x');
        expect(seen[0].url.queryParameters, {
          'api_key': 'DEMO_KEY',
          'query': 'apple',
          'dataType': 'Foundation,SR Legacy',
          'pageNumber': '1',
          'pageSize': '20',
        });
        expect(seen[1].url.queryParameters, {
          'api_key': 'DEMO_KEY',
          'query': 'clif bar',
          'dataType': 'Branded',
          'pageNumber': '3',
          'pageSize': '20',
        });
        expect(seen[2].url.queryParameters['api_key'], 'k3y');
        expect(seen[0].url.host, 'api.nal.usda.gov');
        expect(seen[0].url.path, '/fdc/v1/foods/search');
      },
    );
  });

  group('LookupDishSource', () {
    final candidate = {
      'dishName': 'Laksa',
      'location': 'Bluewall - Grill',
      'hallTid': 4306,
      'nutrition': {
        'servingSize': '1 bowl',
        'calories': 420,
        'caloriesFromFat': 100,
        'totalFatG': 11,
        'satFatG': 4,
        'transFatG': 0,
        'cholesterolMg': 10,
        'sodiumMg': 900,
        'totalCarbG': 60,
        'dietaryFiberG': 3,
        'sugarsG': 5,
        'proteinG': 18,
      },
      'allergens': ['Shellfish'],
      'dietTags': <String>[],
    };
    final now = DateTime.utc(2026, 10, 15, 12, 40);
    late http.Request req;
    Future<LookupResult> run(
      http.Response Function() answer, {
      Duration? wait,
    }) {
      final s = LookupDishSource(
        MockClient((r) async {
          req = r;
          return answer();
        }),
        url: 'https://x.supabase.co',
        key: 'sb_publishable_test',
        now: () => now,
      );
      return s.lookup('laksa');
    }

    test(
      'POSTs the query only, with the publishable key as apikey and bearer',
      () async {
        await run(() => http.Response(jsonEncode({'status': 'miss'}), 200));
        expect(req.method, 'POST');
        expect(
          req.url.toString(),
          'https://x.supabase.co/functions/v1/lookup-dish',
        );
        expect(jsonDecode(req.body), {'query': 'laksa'});
        expect(req.headers['apikey'], 'sb_publishable_test');
        expect(req.headers['Authorization'], 'Bearer sb_publishable_test');
        expect(req.headers['Content-Type'], startsWith('application/json'));
      },
    );

    test('hit: candidates with nutrition', () async {
      final r = await run(
        () => http.Response(
          jsonEncode({
            'status': 'hit',
            'candidates': [candidate],
          }),
          200,
        ),
      );
      final hit = r as LookupHit;
      expect(hit.candidates.single.dishName, 'Laksa');
      expect(hit.candidates.single.location, 'Bluewall - Grill');
      expect(hit.candidates.single.hallTid, 4306);
      expect(hit.candidates.single.nutrition.calories, 420);
      expect(hit.candidates.single.allergens, ['Shellfish']);
    });

    test('miss', () async {
      expect(
        await run(() => http.Response(jsonEncode({'status': 'miss'}), 200)),
        isA<LookupMiss>(),
      );
    });

    test(
      'rate limited: resets on the next UTC hour, whatever the reason',
      () async {
        for (final reason in ['budget_exhausted', 'in_progress']) {
          final r =
              await run(
                    () => http.Response(
                      jsonEncode({'status': 'rate_limited', 'reason': reason}),
                      200,
                    ),
                  )
                  as LookupRateLimited;
          expect(r.resetsAt, DateTime.utc(2026, 10, 15, 13));
          expect(r.reason, reason);
        }
        final top =
            await run(
                  () => http.Response(
                    jsonEncode({'status': 'rate_limited'}),
                    200,
                  ),
                )
                as LookupRateLimited;
        expect(top.resetsAt, DateTime.utc(2026, 10, 15, 13));
      },
    );

    test('on the hour boundary the reset is the following hour', () async {
      final s = LookupDishSource(
        MockClient(
          (_) async =>
              http.Response(jsonEncode({'status': 'rate_limited'}), 200),
        ),
        now: () => DateTime.utc(2026, 10, 15, 23),
      );
      expect(
        ((await s.lookup('x')) as LookupRateLimited).resetsAt,
        DateTime.utc(2026, 10, 16),
      );
    });

    test('failed: 502, bad body, bad shape, no route', () async {
      expect(
        await run(
          () => http.Response(
            jsonEncode({'error': 'UMass Dining lookup failed'}),
            502,
          ),
        ),
        isA<LookupFailed>(),
      );
      expect(
        await run(() => http.Response('<html>', 200)),
        isA<LookupFailed>(),
      );
      expect(
        await run(
          () => http.Response(
            jsonEncode({'status': 'hit', 'candidates': 'x'}),
            200,
          ),
        ),
        isA<LookupFailed>(),
      );
      expect(
        await run(() => http.Response(jsonEncode({'status': 'wat'}), 200)),
        isA<LookupFailed>(),
      );
      final s = LookupDishSource(
        MockClient((_) async => throw const SocketException('down')),
        now: () => now,
      );
      expect(await s.lookup('x'), isA<LookupFailed>());
    });
  });
}
