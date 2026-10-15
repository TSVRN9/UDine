import 'package:flutter/foundation.dart';

import '../../core/content.dart' show RetailMenuItems;
import '../../core/m2/board.dart';
import '../../core/m2/places.dart';
import '../../core/m2/search.dart';
import '../../core/types.dart' show diningHalls;
import '../../data/repository.dart';
import '../../shell/plate_model.dart';
import '../../shell/prefs.dart';
import '../dish/where_book.dart';
import '../halls/halls_controller.dart';
import '../../core/m2/history.dart' show cafeIdsOf;
import '../hall/hall_controller.dart' show grabsOf;

/// Search's one load, started when the tab first opens (never at launch): today's hours (Halls' own controller, which also reads busy
/// for the hall cards), then every place's today and tomorrow through the repository's prefetch (`WhereBook`: the halls, then the cafés,
/// each place-day asked of the network at most once, as background work). Typing and lenses only filter what is in memory, and the
/// order is computed then, with the plate as it is at that moment: a plate change redraws controls, never the order.
class SearchController extends ChangeNotifier {
  SearchController(this.repo, this.prefs, this.plate) {
    hallsData = HallsController(repo)..addListener(_onHours);
    prefs.addListener(_onPrefs);
    _onHours();
  }
  final Repository repo;
  final AppPrefs prefs;
  final PlateModel plate;
  late final HallsController hallsData;
  WhereBook? _book;
  SearchIndex? index;
  String query = '';
  Set<Lens> lenses = const {};
  SearchResult result = const SearchResult();
  /// bumps whenever the result is made again (a keystroke, a lens, data, a preference), never on a plate change
  int generation = 0;
  bool _disposed = false;
  bool _charles = false;

  Map<String, int> get cafeIds => _hours == null ? const {} : cafeIdsOf(_hours!.feed);

  /// every place's days are in (the halls' arrive first and are searched while the cafés come)
  bool get complete => _book?.complete ?? false;

  HoursData? get _hours => switch (hallsData.state) { Loaded(:final value) || LoadedOffline(:final value) => value, _ => null };

  void _onHours() {
    final h = _hours;
    if (h != null && _book == null) {
      final roster = Roster.fromFeed(h.feed), today = repo.today;
      final base = Board(
        clock: repo.now(),
        places: [for (var i = 0; i < halls.length; i++) Place(key: halls[i], name: diningHalls[i].name, area: -1), ...roster.cafes],
        hours: roster.hours, grab: grabsOf(h.feed), days: {today: const {}, addDays(today, 1): const {}}, events: const [],
      );
      _charles = prefs.charlesRiver;
      _book = WhereBook(repo, base, cafeIdsOf(h.feed))..addListener(_onBook);
    }
    notifyListeners();
  }

  void _onBook() {
    if (_disposed) return;
    _reindex();
  }

  void _reindex() {
    final b = _book?.board;
    if (b == null) return;
    index = SearchIndex(b, repo.now(), charlesRiver: prefs.charlesRiver, standing: _standing());
    _charles = prefs.charlesRiver;
    _compute();
  }

  /// A café that lists no dishes but names its items (its standing menu), for the places Search finds by an item.
  Map<String, List<String>> _standing() {
    final h = _hours;
    if (h == null) return const {};
    final byTitle = {for (final r in h.feed.retail) straight(r.name): r};
    final out = <String, List<String>>{};
    for (var i = 0; i < cafeTable.length; i++) {
      final loc = byTitle[straight(cafeTable[i].title)];
      if (loc == null) continue;
      if (resolveCafeMenu(const [], loc) case StandingCafeMenu(menu: RetailMenuItems(:final items))) out['c$i'] = [for (final x in items) x.name];
    }
    return out;
  }

  void _onPrefs() {
    if (prefs.charlesRiver != _charles) {
      _reindex();
    } else {
      _compute();
    }
  }

  void _compute() {
    final ix = index;
    generation++;
    result = ix == null ? const SearchResult() : runSearch(ix, query: query, lenses: lenses, favorites: prefs.favorites, plate: plate.state);
    notifyListeners();
  }

  void setQuery(String q) {
    if (q == query) return;
    query = q;
    _compute();
  }

  void toggleLens(Lens l) {
    lenses = lenses.contains(l) ? ({...lenses}..remove(l)) : {...lenses, l};
    _compute();
  }

  @override
  void dispose() {
    _disposed = true;
    prefs.removeListener(_onPrefs);
    hallsData.removeListener(_onHours);
    hallsData.dispose();
    _book?.removeListener(_onBook);
    _book?.dispose();
    super.dispose();
  }
}
