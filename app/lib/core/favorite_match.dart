// Port of shared/src/favoriteMatch.ts; shared/vectors/favorite-match.json is the contract.
import 'm2/board.dart' show isAlways;
import 'types.dart';

class FavoriteDishMatch {
  const FavoriteDishMatch({required this.dishName, required this.hallTid, required this.mealPeriod, required this.date});
  final String dishName, date;
  final int hallTid;
  final MealPeriod mealPeriod;
  Map<String, dynamic> toJson() => {'dishName': dishName, 'hallTid': hallTid, 'mealPeriod': mealPeriod.name, 'date': date};
}

/// Exact, case-sensitive match of dish favorites against menu items; first item per (hall, name) wins.
/// Order: halls by first appearance in [menuItems], then favorited names in [favorites] order.
List<FavoriteDishMatch> matchFavoritedDishes(List<Favorite> favorites, List<MenuItem> menuItems) {
  final names = {for (final f in favorites) if (f is DishFavorite && !isAlways(f.dishName)) f.dishName};
  if (names.isEmpty) return [];
  final firstByHall = <int, Map<String, MenuItem>>{};
  for (final item in menuItems) {
    firstByHall.putIfAbsent(item.hallTid, () => {}).putIfAbsent(item.dishName, () => item);
  }
  return [
    for (final e in firstByHall.entries)
      for (final n in names)
        if (e.value[n] case final item?) FavoriteDishMatch(dishName: n, hallTid: e.key, mealPeriod: item.mealPeriod, date: item.date),
  ];
}
