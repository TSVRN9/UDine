// Search's two asks past the menus: the Packaged group (OpenFoodFacts, then USDA) and "Search UMass Dining" (`lookup-dish`). Both are
// asked of the network only by Search, only with tracking on, online and a query typed; each answers for the query it was asked and
// is dropped for any other. Nothing here is saved or sent but the query text.
import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/m2/board.dart' show dishKey;
import '../core/packaged_food.dart';
import '../core/saved_food.dart' show dietBits;
import '../core/types.dart';
import 'packaged.dart';

/// How long the query rests before the packaged sources are asked: OFF and USDA's public key are rate-limited per client, and a keystroke
/// is not a question.
const packagedDebounce = Duration(milliseconds: 400);

enum PackPhase { idle, loading, ok, fail }

class PackagedSearch extends ChangeNotifier {
  PackagedSearch(this.source, {this.debounce = packagedDebounce});
  final PackagedSource source;
  final Duration debounce;

  String query = '';
  PackPhase phase = PackPhase.idle;
  /// OFF's first page, then USDA's generic and branded first pages, as each answered; the group's own rules are `packagedGroup`'s
  List<PackagedFood> hits = const [];
  final _memo = <String, List<PackagedFood>>{};
  Timer? _timer;
  int _seq = 0;
  bool _disposed = false;

  /// Asks for [q] (trimmed; empty asks for nothing). A query already answered this session is answered again from memory.
  void ask(String q) {
    if (q == query) return;
    _timer?.cancel();
    final seq = ++_seq;
    query = q;
    hits = const [];
    if (q.isEmpty) {
      phase = PackPhase.idle;
    } else if (_memo[q.toLowerCase()] case final m?) {
      phase = PackPhase.ok;
      hits = m;
    } else {
      phase = PackPhase.loading;
      _timer = Timer(debounce, () => _run(q, seq));
    }
    notifyListeners();
  }

  /// Nothing is to be asked (tracking off, offline): whatever was pending is dropped.
  void stop() {
    if (query.isEmpty && phase == PackPhase.idle) return;
    _timer?.cancel();
    _seq++;
    query = '';
    phase = PackPhase.idle;
    hits = const [];
    notifyListeners();
  }

  /// Try again, for the same query.
  void retry() {
    if (query.isEmpty || phase == PackPhase.loading) return;
    final seq = ++_seq;
    phase = PackPhase.loading;
    notifyListeners();
    _run(query, seq);
  }

  Future<void> _run(String q, int seq) async {
    var failed = 0;
    Future<List<PackagedFood>> one(Future<PackagedPage> Function() f) =>
        f().then((p) => p.results, onError: (Object e) {
          failed++;
          return <PackagedFood>[];
        });
    final got = await Future.wait([one(() => source.offSearch(q)), one(() => source.usdaGeneric(q)), one(() => source.usdaBranded(q))]);
    if (_disposed || seq != _seq) return;
    if (failed == got.length) {
      phase = PackPhase.fail;
    } else {
      // (interleaved, so the 20 the group shows are from every source that answered, not the first one's)
      hits = [for (var i = 0; got.any((g) => i < g.length); i++) for (final g in got) if (i < g.length) g[i]];
      if (failed == 0) _memo[q.toLowerCase()] = hits; // (a source that failed is asked again the next time, not remembered as empty)
      phase = PackPhase.ok;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    super.dispose();
  }
}

enum LookupPhase { idle, loading, found, none, failed, limited }

class LookupRun extends ChangeNotifier {
  LookupRun(this.source);
  final LookupDishSource source;

  String query = '';
  LookupPhase phase = LookupPhase.idle;
  /// the dishes that are on no menu today or tomorrow, as foods
  List<PackagedFood> foods = const [];
  /// when the server's budget resets (the next UTC hour), while [phase] is limited
  DateTime? resetsAt;
  /// the server's reason while limited: `budget_exhausted` (resets on the hour) or `in_progress` (another lookup is running)
  String? reason;
  int _seq = 0;
  bool _disposed = false;

  /// An answer is for the query asked; a different one puts the button back.
  void sync(String q) {
    if (q == query || phase == LookupPhase.idle) return;
    _seq++;
    query = '';
    phase = LookupPhase.idle;
    foods = const [];
    notifyListeners();
  }

  /// Asks UMass Dining for [q]; [served] are the dish keys on any menu today or tomorrow, which are not new to anyone.
  Future<void> run(String q, Set<String> served) async {
    if (phase == LookupPhase.loading) return;
    final seq = ++_seq;
    query = q;
    phase = LookupPhase.loading;
    notifyListeners();
    final r = await source.lookup(q);
    if (_disposed || seq != _seq) return;
    switch (r) {
      case LookupHit(:final candidates):
        final seen = <String>{};
        foods = [
          for (final c in candidates)
            if (!served.contains(dishKey(c.dishName)) && seen.add(dishKey(c.dishName)))
              PackagedFood(
                source: UmassMenuSource(dishName: c.dishName, hallTid: c.hallTid), productName: c.dishName, nutrition: c.nutrition, allergens: c.allergens, diet: dietBits(c.dietTags),
              ),
        ].take(maxLookupDishes).toList();
        phase = foods.isEmpty ? LookupPhase.none : LookupPhase.found;
      case LookupMiss():
        foods = const [];
        phase = LookupPhase.none;
      case LookupRateLimited(:final resetsAt, reason: final why):
        this.resetsAt = resetsAt;
        reason = why;
        phase = LookupPhase.limited;
      case LookupFailed():
        phase = LookupPhase.failed;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// M2's `lookupHits` keeps the first ten.
const maxLookupDishes = 10;
