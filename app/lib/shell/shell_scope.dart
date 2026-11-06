import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/widgets.dart';

import '../ui/sheet.dart';

/// What a screen asks of the app around it: a sheet mounts above everything, the tab bar included.
abstract class ShellApi {
  /// Mounts a sheet; `build` receives its handle and the callback that removes it once it has closed.
  /// `label` names the sheet for a screen reader. A push of a sheet of the same type as one already opening or open returns that one's handle (a double tap).
  /// `onboarding`: a sheet that is the user's to finish (first run); a notification tap leaves it up.
  SheetHandle pushSheet(Widget Function(SheetHandle handle, VoidCallback done) build, {bool onboarding = false, String? label});

  /// Pushes a place's menu (a hall or a café, `W` or `c3`) onto the stack at a day and meal, already scrolled to the dish named by
  /// `dish` (its `key`): where a where-served tap goes.
  void openPlace(String place, {required String meal, required int day, required String dish});

  /// Goes to the Search tab (the plate's Add something else) for a plate of `meal`.
  void openSearch({required String meal});

  /// Android back is offered to this sheet first (after any pushed sheet, before the pages) while the function returns it: the sheet
  /// closes to its lowest height, following the gesture when it is the predictive one. Null to stop offering.
  void handleBack(SheetHandle? Function()? openSheet);

  /// The place page (`W`, `c3`) open on the Halls tab's stack, or null: where Search takes the user to be. A page Search itself opens is on
  /// Search's own stack, so it never sets this. Closing the place clears it.
  ValueListenable<String?> get here;

  /// The meal the plate's Add something else came for: Search adds to it, until the tab is left or the query is cleared. Null: the clock's meal.
  ValueNotifier<String?> get searchMeal;

}

class ShellScope extends InheritedWidget {
  const ShellScope({super.key, required this.api, required super.child});
  final ShellApi api;
  static ShellApi of(BuildContext context) => context.getInheritedWidgetOfExactType<ShellScope>()!.api;
  @override
  bool updateShouldNotify(ShellScope old) => old.api != api;
}
