import 'package:flutter/widgets.dart';
import 'logic/fixture.dart';
import 'ui/sheet.dart';

/// A dish sheet's context: the serving it shows (price and macros come from its place), where it was opened from, and whether an
/// Add is offered (only today's dishes go on today's plate).
class DishCtx {
  final Dish dish;
  final String place, meal;
  final int day;
  final bool fromPlate;
  /// the places an Add counts for: the hall from a menu, the plate item's own from the plate
  final Map<String, Dish>? refs;
  const DishCtx({required this.dish, required this.place, required this.meal, required this.day, this.fromPlate = false, this.refs});
}

/// A where-served tap's destination: the place's screen on that day and meal, arriving at the dish.
class HallTarget {
  final String place, meal, dishKey;
  final int day;
  const HallTarget({required this.place, required this.meal, required this.day, required this.dishKey});
}

/// What a screen asks of the app around it: sheets mount above everything (the tab bar included), and a push covers the screen
/// under the tab bar and plate bar. Implemented by the shell.
abstract class ShellApi {
  /// Mounts a sheet; `build` receives its handle and the callback that removes it when it has closed.
  SheetHandle pushSheet(Widget Function(SheetHandle handle, VoidCallback done) build);
  void openDish(DishCtx ctx);
  /// Pushes a hall over the current screen (sheet to hall); the one slot is replaced if already used.
  void pushHall(HallTarget target);
  /// Pushes any page from the right (You to Dietary preferences).
  void pushPage(Widget Function(BuildContext context, VoidCallback pop) build);
  /// The status inset the app draws under: the device's, floored at M2's 24.
  double get top;
}

class ShellScope extends InheritedWidget {
  final ShellApi api;
  const ShellScope({super.key, required this.api, required super.child});
  static ShellApi of(BuildContext context) => context.getInheritedWidgetOfExactType<ShellScope>()!.api;
  @override
  bool updateShouldNotify(ShellScope old) => old.api != api;
}
