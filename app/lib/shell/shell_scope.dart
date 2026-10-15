import 'package:flutter/widgets.dart';

import '../ui/sheet.dart';

/// What a screen asks of the app around it: a sheet mounts above everything, the tab bar included.
abstract class ShellApi {
  /// Mounts a sheet; `build` receives its handle and the callback that removes it once it has closed.
  SheetHandle pushSheet(Widget Function(SheetHandle handle, VoidCallback done) build);

  /// Pushes a place's menu (a hall or a café, `W` or `c3`) onto the stack at a day and meal, already scrolled to the dish named by
  /// `dish` (its `key`): where a where-served tap goes.
  void openPlace(String place, {required String meal, required int day, required String dish});

  /// Goes to the Search tab (the plate's Add something else) for a plate of `meal`.
  void openSearch({required String meal});

  /// Android back is offered to this first (after any pushed sheet, before the pages): true when it was used. Null to stop offering.
  void handleBack(bool Function()? handler);

  /// Flies `text` from `from` (global) to the You tab, where a logged plate lands.
  void toss({required Offset from, required String text});
}

class ShellScope extends InheritedWidget {
  const ShellScope({super.key, required this.api, required super.child});
  final ShellApi api;
  static ShellApi of(BuildContext context) => context.getInheritedWidgetOfExactType<ShellScope>()!.api;
  @override
  bool updateShouldNotify(ShellScope old) => old.api != api;
}
