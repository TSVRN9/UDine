// The Packaged group's and Search UMass Dining's state machines over M2's recordings (flutter-port-packaged-foods Task 3): what each asks,
// when, and what a stale or failed answer does. No network: RecordedPackagedClient answers from packaged-2026-10-13.json and the menus.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:udine/core/m2/board.dart' show dishKey;
import 'package:udine/data/packaged.dart';
import 'package:udine/data/packaged_search.dart';
import 'package:udine/data/recorded/flags.dart';
import 'package:udine/data/recorded/recorded_packaged.dart';

Map<String, dynamic> load(String f) => jsonDecode(File(f).readAsStringSync()) as Map<String, dynamic>;

RecordedPackagedClient recorded({LookupMode lookup = LookupMode.found, bool packFail = false}) => RecordedPackagedClient(
      flow: load('../docs/design/explorations/2026-10-ui-overhaul/flows/packaged-2026-10-13.json'),
      menus: load('../docs/design/explorations/2026-10-ui-overhaul/flows/menus-2026-10-08-to-22.json'),
      lookup: lookup, packFail: packFail,
    );

class Counting extends http.BaseClient {
  Counting(this.inner);
  final http.Client inner;
  final urls = <Uri>[];
  @override
  Future<http.StreamedResponse> send(http.BaseRequest r) {
    urls.add(r.url);
    return inner.send(r);
  }
}

void main() {
  group('PackagedSearch', () {
    late Counting net;
    late PackagedSearch p;
    setUp(() {
      net = Counting(recorded());
      p = PackagedSearch(PackagedSource(net, retryDelay: Duration.zero), debounce: const Duration(milliseconds: 20));
    });
    tearDown(() => p.dispose());

    Future<void> settled() async {
      for (var i = 0; i < 100 && p.phase == PackPhase.loading; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
    }

    test('nothing is asked until the query has rested; a keystroke inside the wait asks once, for the last query', () async {
      p.ask('c');
      p.ask('cl');
      p.ask('clif');
      expect(p.phase, PackPhase.loading);
      expect(net.urls, isEmpty);
      await settled();
      expect(p.phase, PackPhase.ok);
      final q = net.urls.map((u) => u.queryParameters['search_terms'] ?? u.queryParameters['query']).toSet();
      expect(q, {'clif'});
      expect(net.urls.map((u) => u.host).toSet(), {'world.openfoodfacts.org', 'api.nal.usda.gov'});
      expect(p.hits.first.displayName, 'Clif bar');
      expect(p.hits, hasLength(20));
    });

    test('a query answered once is answered from memory the second time', () async {
      p.ask('clif');
      await settled();
      final n = net.urls.length;
      p.ask('clif b');
      p.ask('clif');
      expect(p.phase, PackPhase.ok);
      expect(net.urls.length, n);
    });

    test('an empty query, or stop(), asks nothing and drops what was pending', () async {
      p.ask('clif');
      p.stop();
      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect([p.phase, net.urls], [PackPhase.idle, isEmpty]);
      p.ask('clif');
      p.ask('');
      expect(p.phase, PackPhase.idle);
    });

    test('a query the recording does not cover answers nothing, and that is ok, not a failure', () async {
      p.ask('laksa');
      await settled();
      expect([p.phase, p.hits], [PackPhase.ok, isEmpty]);
    });

    test('every source failing is the failed state; Try again asks again and can come back', () async {
      final bad = PackagedSearch(PackagedSource(recorded(packFail: true), retryDelay: Duration.zero), debounce: Duration.zero);
      addTearDown(bad.dispose);
      bad.ask('clif');
      for (var i = 0; i < 100 && bad.phase == PackPhase.loading; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect(bad.phase, PackPhase.fail);
      bad.retry();
      expect(bad.phase, PackPhase.loading);
    });

    test('the sources are interleaved: one from OFF, one from USDA generic, one branded, and so on', () async {
      Map<String, dynamic> off(String n) => {'code': 'c$n', 'product_name': 'off $n', 'nutriments': {'energy-kcal_100g': 100}};
      Map<String, dynamic> usda(String n) => {'fdcId': n.hashCode, 'description': 'usda $n', 'foodNutrients': [{'nutrientName': 'Energy', 'unitName': 'KCAL', 'value': 90}]};
      final mock = MockClient((r) async {
        if (r.url.host != 'api.nal.usda.gov') return http.Response(jsonEncode({'count': 3, 'products': [off('a'), off('b'), off('c')]}), 200);
        final generic = r.url.queryParameters['dataType'] != 'Branded';
        return http.Response(jsonEncode({'foods': [for (final n in generic ? ['g1', 'g2'] : ['b1', 'b2', 'b3']) usda(n)], 'currentPage': 1, 'totalPages': 1}), 200);
      });
      final q = PackagedSearch(PackagedSource(mock, retryDelay: Duration.zero), debounce: Duration.zero)..ask('x');
      addTearDown(q.dispose);
      for (var i = 0; i < 100 && q.phase == PackPhase.loading; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect([for (final f in q.hits) f.productName], ['off a', 'usda g1', 'usda b1', 'off b', 'usda g2', 'usda b2', 'off c', 'usda b3']);
    });

    test('one source answering is enough: the others failing leaves what came', () async {
      final half = MockClient((r) async => r.url.host == 'api.nal.usda.gov' ? http.Response('x', 500) : http.Response.bytes(await recorded().send(http.Request('GET', r.url)).then((s) => s.stream.toBytes()), 200));
      final q = PackagedSearch(PackagedSource(half, retryDelay: Duration.zero), debounce: Duration.zero)..ask('clif');
      addTearDown(q.dispose);
      for (var i = 0; i < 100 && q.phase == PackPhase.loading; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 10));
      }
      expect([q.phase, q.hits.length], [PackPhase.ok, 20]);
    });
  });

  group('LookupRun', () {
    LookupRun run(LookupMode m) => LookupRun(LookupDishSource(recorded(lookup: m), now: () => DateTime.utc(2026, 10, 8, 16, 41)));

    test('found: only dishes that are on no menu today or tomorrow, as UMass Dining foods with their hall', () async {
      final l = run(LookupMode.found);
      await l.run('laksa', const {});
      expect(l.phase, LookupPhase.found);
      expect(l.foods.single.productName, startsWith('Laksa Noodle Bowl'));
      expect(l.foods.single.id, endsWith('|4'));
      expect(l.foods.single.diet, isA<int>());
      final again = run(LookupMode.found)..run('laksa', {dishKey(l.foods.single.productName)}); // (served today or tomorrow: nothing new)
      await Future<void>.delayed(const Duration(milliseconds: 50));
      expect(again.phase, LookupPhase.none);
    });

    test('none, failed and rate-limited are each their own phase; limited carries the next UTC hour', () async {
      final none = run(LookupMode.none);
      await none.run('zzzq', const {});
      expect(none.phase, LookupPhase.none);
      final bad = run(LookupMode.fail);
      await bad.run('laksa', const {});
      expect(bad.phase, LookupPhase.failed);
      final lim = run(LookupMode.limited);
      await lim.run('laksa', const {});
      expect([lim.phase, lim.resetsAt], [LookupPhase.limited, DateTime.utc(2026, 10, 8, 17)]);
      expect(lim.reason, 'budget_exhausted'); // (in_progress is told apart, so its copy can change in one place)
    });

    test('an answer is for the query asked: typing on puts the button back, and a late answer to the old query is dropped', () async {
      final l = run(LookupMode.found);
      final f = l.run('laksa', const {});
      l.sync('laksa b');
      expect(l.phase, LookupPhase.idle);
      await f;
      expect(l.phase, LookupPhase.idle);
    });
  });
}
