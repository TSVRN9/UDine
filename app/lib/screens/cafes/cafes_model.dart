import '../../core/content.dart';
import '../../core/m2/board.dart' show Place;
import '../../core/m2/menu_view.dart' show mealOrder;
import '../../core/m2/places.dart';
import '../../core/m2/status.dart';
import '../../core/types.dart';
import '../../data/repository.dart';

/// M2 `areaOrder`: the area nearest the hall opened last first, then the rest in order (Charles River last, when on).
List<int> areaOrder({required String? lastHall, required bool charlesRiver}) {
  final near = const {'W': 1, 'H': 3, 'B': 3, 'F': 0}[lastHall];
  final areas = areasOn(charlesRiver: charlesRiver);
  return near == null ? areas : [near, ...areas.where((a) => a != near)];
}

class CafeRowVM {
  const CafeRowVM({required this.place, this.status, required this.open});
  final Place place;
  /// null until the hours are known
  final String? status;
  final bool open;
}

class CafeAreaVM {
  const CafeAreaVM({required this.area, required this.name, required this.rows});
  final int area;
  final String name;
  final List<CafeRowVM> rows;
}

class CafesVM {
  const CafesVM(this.areas);
  final List<CafeAreaVM> areas;
}

/// M2's `pageContent('cafes')`: every area in `areaOrder`, each with its places open first, then by name. `openNow` keeps the open ones
/// (an area with none keeps its header and says so). Until the hours are known nothing can be said to be open, so the chip hides nothing.
/// The Charles River filter is `placesOn`, the one place it lives.
CafesVM buildCafes({required DateTime now, required DataState<HoursData> state, required bool openNow, required bool charlesRiver, String? lastHall}) {
  final feed = switch (state) {
    Loaded(:final value) || LoadedOffline(:final value) => value.feed,
    _ => null,
  };
  final roster = feed == null ? Roster.table : Roster.fromFeed(feed);
  final shown = placesOn(roster.cafes, charlesRiver: charlesRiver);
  CafeRowVM row(Place p) {
    final h = roster.hours[p.key];
    return CafeRowVM(place: p, status: feed == null || h == null ? null : statusText(h, now), open: h != null && isOpenNow(h, now));
  }

  return CafesVM([
    for (final a in areaOrder(lastHall: lastHall, charlesRiver: charlesRiver))
      CafeAreaVM(
        area: a, name: areaNames[a],
        rows: [for (final p in shown) if (p.area == a) row(p)]
            .where((r) => !openNow || feed == null || r.open)
            .toList()
          ..sort((x, y) => x.open == y.open ? x.place.name.toLowerCase().compareTo(y.place.name.toLowerCase()) : (x.open ? -1 : 1)),
      ),
  ]);
}

/// What a café page body is (CONCEPT R9 §5, R11 §3), from the menu the repository resolved.
sealed class CafeBodyKind {
  const CafeBodyKind();
}

/// Dishes: the hall page's body. `tabs` is false for a café with a single meal (it has no tab row).
class DishesBody extends CafeBodyKind {
  const DishesBody(this.meals);
  final List<MealPeriod> meals;
  bool get tabs => meals.length > 1;
}

class NamesBody extends CafeBodyKind {
  const NamesBody(this.items);
  final List<RetailMenuItem> items;
}

/// The café lists its menus as PDFs: `flutter-port-cafe-pdf` fills the "Menus" rows.
class PdfBody extends CafeBodyKind {
  const PdfBody(this.pdf);
  final RetailMenuPdf pdf;
}

/// "Name doesn't list its menu in the app."
class NoMenuBody extends CafeBodyKind {
  const NoMenuBody();
}

/// ponytail: the meals are today's (the hall menu's day cell reads other days); M2 decides single-meal across every day.
CafeBodyKind cafeBody(CafeMenu menu) => switch (menu) {
      IntegratedCafeMenu(:final items) => DishesBody([
          for (final m in mealOrder)
            if (items.any((i) => mealKeyOf[i.mealPeriod] == m)) _of[m]!,
        ]),
      StandingCafeMenu(:final menu) => switch (menu) {
          RetailMenuItems(:final items) => NamesBody(items),
          RetailMenuPdf() => PdfBody(menu),
          RetailMenuEmpty() => const NoMenuBody(),
        },
    };

/// M2's meal key for a feed period.
const mealKeyOf = {MealPeriod.breakfast: 'breakfast', MealPeriod.lunch: 'lunch', MealPeriod.dinner: 'dinner', MealPeriod.latenight: 'late', MealPeriod.allday: 'all', MealPeriod.grabngo: 'grab'};
final _of = {for (final e in mealKeyOf.entries) e.value: e.key};
