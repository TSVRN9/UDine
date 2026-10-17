// The cafés and markets M2 lists, with their areas and buildings: a port of build.py's AREAS, CAFES and SHORT (get_infov2 carries
// neither). A café's key is `c<index in this table>`, so Terrace is c27 and Charles River c28. babyBerk, the Grab 'N Go entries and
// The Commonwealth Restaurant are not in the table, so they are never listed. Checked against the fixture's places and vectors.json.
import '../hours.dart' show parseMapAddress, parseStreetAddress;
import '../types.dart';
import 'board.dart';

const areaNames = ['Campus Center', 'North, by Worcester', 'Library and academic core', 'Southwest, by Hampshire and Berkshire', 'Charles River Campus, Newton'];

/// The Newton campus. Its places show only while You's Charles River Campus toggle is on (NOTES "Round 9b"); Terrace is always in.
const charlesRiverArea = 4;

class CafeEntry {
  const CafeEntry(this.title, this.name, this.area, this.building);
  /// get_infov2's `location_title`
  final String title, name, building;
  final int area;
}

const cafeTable = [
  CafeEntry('Paciugo', 'Paciugo', 0, 'Campus Center'),
  CafeEntry('Tavola', 'Tavola', 0, 'Campus Center'),
  CafeEntry('Yum! Bakery', 'Yum! Bakery', 0, 'Blue Wall, Campus Center'),
  CafeEntry('Green Fields', 'Green Fields', 0, 'Blue Wall, Campus Center'),
  CafeEntry('Tamales', 'Tamales', 0, 'Blue Wall, Campus Center'),
  CafeEntry('Wasabi', 'Wasabi', 0, 'Blue Wall, Campus Center'),
  CafeEntry('Deli Delish', 'Deli Delish', 0, 'Blue Wall, Campus Center'),
  CafeEntry('Star Ginger', 'Star Ginger', 0, 'Blue Wall, Campus Center'),
  CafeEntry('The Grill', 'The Grill', 0, 'Blue Wall, Campus Center'),
  CafeEntry("People's Organic Coffee", "People's Organic Coffee", 0, 'Campus Center concourse'),
  CafeEntry('Harvest Market', 'Harvest Market', 0, 'Campus Center concourse'),
  CafeEntry('UMass Store', 'UMass Store', 0, 'Campus Center, 2nd floor'),
  CafeEntry('Worcester Café', 'Worcester Café', 1, 'Worcester Commons'),
  CafeEntry('ISB Café', 'ISB Café', 1, 'Integrated Science Building'),
  CafeEntry('Morrill Café', 'Morrill Café', 1, 'Morrill 2'),
  CafeEntry('Snack Overflow', 'Snack Overflow', 1, 'Manning CICS'),
  CafeEntry('The Hub', 'The Hub', 1, 'Furcolo Hall'),
  CafeEntry('Newman Café', 'Newman Café', 1, 'Newman Center'),
  CafeEntry('Peet’s Coffee & Tea', "Peet's Coffee & Tea", 1, 'Integrated Learning Center'),
  CafeEntry('Procrastination Station', 'Procrastination Station', 2, 'Du Bois Library'),
  CafeEntry('Whitmore Café', 'Whitmore Café', 2, 'Whitmore Building'),
  CafeEntry('Carney Café', 'Carney Café', 2, 'Isenberg'),
  CafeEntry('Post & Bean Café', 'Post & Bean Café', 2, 'Olver Design Building'),
  CafeEntry('Hampshire Café', 'Hampshire Café', 3, 'Hampshire Dining Commons'),
  CafeEntry('Argo Tea', 'Argo Tea', 3, 'Hampden'),
  CafeEntry('Roots Café', 'Roots Café', 3, 'Honors College'),
  CafeEntry('Courtside Café', 'Courtside Café', 3, 'Recreation Center'),
  CafeEntry('Terrace', 'Terrace', 3, 'Fieldstone Apartments'),
  CafeEntry('Charles River Campus of UMass Amherst', 'Charles River Campus', 4, 'Newton'),
  CafeEntry('The Commonwealth Restaurant', 'The Commonwealth Restaurant', 1, 'Worcester Commons'), // c29: appended last so no key moves (R11 §3)
];

/// `c<i>` of the café M2 calls `name`, or null.
String? cafeKey(String name) {
  final i = cafeTable.indexWhere((c) => c.name == name);
  return i < 0 ? null : 'c$i';
}

/// The hall a get_infov2 title names (`Worcester Commons`, `Franklin Dining Commons`), as hours.dart matches it; null for anything else.
String? hallKeyOfTitle(String title) {
  for (var i = 0; i < diningHalls.length; i++) {
    if (title.startsWith(diningHalls[i].name) && title.contains('Commons')) return halls[i];
  }
  return null;
}

/// The feed spells a title with ’ and ‘; M2 spells names with '.
String straight(String s) => s.replaceAll('’', "'").replaceAll('‘', "'");

// ---- the Charles River filter: every list of places (pins, the cafés page, area counts, Search) goes through these ----

/// M2 `placeOn`.
bool placeOn(Place p, {required bool charlesRiver}) => p.area != charlesRiverArea || charlesRiver;

/// M2 `areasOn`: the areas listed, Charles River last and only when on.
List<int> areasOn({required bool charlesRiver}) => [for (var a = 0; a < areaNames.length; a++) if (a != charlesRiverArea || charlesRiver) a];

List<Place> placesOn(Iterable<Place> places, {required bool charlesRiver}) => [for (final p in places) if (placeOn(p, charlesRiver: charlesRiver)) p];

/// What a feed holds: the four halls' hours (keys W F H B), and the cafés it carries in the table's order (keys `c<i>`), each with its
/// one window as `general`.
class Roster {
  const Roster(this.cafes, this.hours);
  final List<Place> cafes;
  final Map<String, DiningHallHours> hours;

  /// Before the hours are known: every café of the table, by name and area, with no hours.
  static final table = Roster([for (var i = 0; i < cafeTable.length; i++) Place(key: 'c$i', name: cafeTable[i].name, area: cafeTable[i].area, building: cafeTable[i].building)], const {});

  factory Roster.fromFeed(DiningHoursFeed feed) {
    final byTitle = {for (final r in feed.retail) straight(r.name): r};
    final cafes = <Place>[];
    final hours = <String, DiningHallHours>{for (final h in feed.halls) halls[h.hallTid - 1]: h};
    for (var i = 0; i < cafeTable.length; i++) {
      final e = cafeTable[i], r = byTitle[straight(e.title)];
      if (r == null) continue;
      final key = 'c$i';
      cafes.add(Place(
        key: key, name: e.name, area: e.area, building: e.building, description: r.description ?? '', payment: r.acceptedPayment ?? '',
        address: parseStreetAddress(r.address), mapAddress: parseMapAddress(r.mapAddress),
      ));
      hours[key] = DiningHallHours(hallTid: 0, general: r.hours);
    }
    return Roster(cafes, hours);
  }

  /// A pinned name's place, or null (unknown, or Charles River while off).
  Place? pinned(String name, {required bool charlesRiver}) {
    final p = cafes.where((c) => c.name == name).firstOrNull;
    return p != null && placeOn(p, charlesRiver: charlesRiver) ? p : null;
  }
}
