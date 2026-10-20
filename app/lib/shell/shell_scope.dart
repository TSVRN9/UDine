import 'package:flutter/widgets.dart';

import '../ui/sheet.dart';

/// What a screen asks of the app around it: a sheet mounts above everything, the tab bar included.
abstract class ShellApi {
  /// Mounts a sheet; `build` receives its handle and the callback that removes it once it has closed.
  /// `onboarding`: a sheet that is the user's to finish (first run); a notification tap leaves it up.
  SheetHandle pushSheet(Widget Function(SheetHandle handle, VoidCallback done) build, {bool onboarding = false});

  /// Pushes a place's menu (a hall or a café, `W` or `c3`) onto the stack at a day and meal, already scrolled to the dish named by
  /// `dish` (its `key`): where a where-served tap goes.
  void openPlace(String place, {required String meal, required int day, required String dish});

  /// Goes to the Search tab (the plate's Add something else) for a plate of `meal`.
  void openSearch({required String meal});

  /// Android back is offered to this sheet first (after any pushed sheet, before the pages) while the function returns it: the sheet
  /// closes to its lowest height, following the gesture when it is the predictive one. Null to stop offering.
  void handleBack(SheetHandle? Function()? openSheet);

}

class ShellScope extends InheritedWidget {
  const ShellScope({super.key, required this.api, required super.child});
  final ShellApi api;
  static ShellApi of(BuildContext context) => context.getInheritedWidgetOfExactType<ShellScope>()!.api;
  @override
  bool updateShouldNotify(ShellScope old) => old.api != api;
}
