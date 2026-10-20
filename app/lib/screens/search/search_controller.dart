import 'package:flutter/foundation.dart';

import '../../core/content.dart' show RetailMenuItems;
import '../../core/m2/board.dart';
import '../../core/m2/menu_view.dart' show prefOK;
import '../../core/m2/places.dart';
import '../../core/m2/search.dart';
import '../../core/types.dart' show diningHalls;
import '../../data/packaged.dart' show LookupDishSource, PackagedSource;
import '../../data/packaged_search.dart';
import '../../data/repository.dart';
import '../../shell/food_book.dart';
import '../../shell/plate_model.dart';
import '../../shell/prefs.dart';
import '../dish/where_book.dart';
import '../halls/halls_controller.dart';
import '../../core/m2/history.dart' show cafeIdsOf;
import '../halls/halls_model.dart' show NetLine;
import '../hall/hall_controller.dart' show grabsOf;

/// Search's one load, started when the tab first opens (never at launch): today's hours (Halls' own controller, which also reads busy
/// for the hall cards), then every place's today and tomorrow through the repository's prefetch (`WhereBook`: the halls, then the cafés,
/// each place-day asked of the network at most once, as background work). Typing and lenses only filter what is in memory, and the
/// order is computed then, with the plate as it is at that moment: a plate change redraws controls, never the order.
class SearchController extends ChangeNotifier {
  SearchController(this.repo, this.prefs, this.plate, {PackagedSource? packaged, LookupDishSource? lookupSource, this.foods}) {
    hallsData = HallsController(repo, menus: false)..addListener(_onHours);
    prefs.addListener(_onPrefs);
    pack = packaged == null ? null : (PackagedSearch(packaged)..addListener(_onExtras));
    lookup = lookupSource == null ? null : (LookupRun(lookupSource)..addListener(_onExtras));
    foods?.addListener(_onExtras);
    _onHours();
  }
  final Repository repo;
  final AppPrefs prefs;
  final PlateModel plate;
  late final HallsController hallsData;
  /// the Packaged group's and Search UMass Dining's asks (null where no network is wired), and Your foods
  late final PackagedSearch? pack;
  late final LookupRun? lookup;
  final FoodBook? foods;
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

  /// the board Search reads its menus from (the halls' today first), which the hall cards' stars read too
  Board? get board => _book?.board;

  /// every place's days are in (the halls' arrive first and are searched while the cafés come)
  bool get complete => _book?.complete ?? false;

  /// What the network did to the hours (Halls' own reading): the menus are searched from the phone when offline, and are none when it failed.
  NetLine get net => switch (hallsData.state) { LoadedOffline() || NotSaved() => NetLine.offline, Failed() => NetLine.failed, _ => NetLine.none };

  /// the menus were asked for and a place's days may be in (false while the hours are, or failed to be, had: nothing to find a dish in)
  bool get menusIn => _book != null;

  /// Offline, the cafés whose menu for today is saved (what the top line names beyond the halls).
  List<String> get savedCafes {
    final b = _book?.board, day = b?.days[repo.today];
    if (net != NetLine.offline || b == null || day == null) return const [];
    return [for (final p in b.places) if (isCafe(p.key) && (day[p.key]?.isNotEmpty ?? false)) p.name];
  }

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
    } else if (h == null && _book == null && (hallsData.state is Failed || hallsData.state is NotSaved)) {
      // no hours to be had: the places still match by name, from the bundled table, with no menu to find a dish in
      final fx = Board(clock: repo.now(), places: [for (var i = 0; i < halls.length; i++) Place(key: halls[i], name: diningHalls[i].name, area: -1), ...Roster.table.cafes], hours: const {}, grab: const {}, days: const {}, events: const []);
      index = SearchIndex(fx, repo.now(), charlesRiver: prefs.charlesRiver);
      _charles = prefs.charlesRiver;
      _compute();
      return;
    }
    _asks();
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

  /// Packaged and Search UMass Dining are asked only with tracking on, online and a query typed; otherwise nothing is sent.
  void _asks() {
    final q = query.trim(), on = prefs.track && net != NetLine.offline && q.isNotEmpty;
    if (on) {
      pack?.ask(q);
    } else {
      pack?.stop();
    }
    lookup?.sync(on ? q : '');
  }

  /// Something past the menus changed (an answer, Your foods): the list is made again, and a row that moved glides.
  void _onExtras() {
    if (_disposed) return;
    generation++;
    notifyListeners();
  }

  /// Search UMass Dining, by hand (never by itself: its budget is global).
  void askLookup() => lookup?.run(query.trim(), index?.served ?? const {});

  void _compute() {
    final ix = index;
    _asks();
    generation++;
    result = ix == null ? const SearchResult() : runSearch(ix, query: query, lenses: lenses, favorites: prefs.favorites, plate: plate.state, allow: (d) => prefOK(prefs.diet, d));
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
    pack?.removeListener(_onExtras);
    pack?.dispose();
    lookup?.removeListener(_onExtras);
    lookup?.dispose();
    foods?.removeListener(_onExtras);
    super.dispose();
  }
}
