import 'package:flutter/widgets.dart';

import '../ui/sheet.dart';

/// What a screen asks of the app around it: a sheet mounts above everything, the tab bar included.
abstract class ShellApi {
  /// Mounts a sheet; `build` receives its handle and the callback that removes it once it has closed.
  SheetHandle pushSheet(Widget Function(SheetHandle handle, VoidCallback done) build);
}

class ShellScope extends InheritedWidget {
  const ShellScope({super.key, required this.api, required super.child});
  final ShellApi api;
  static ShellApi of(BuildContext context) => context.getInheritedWidgetOfExactType<ShellScope>()!.api;
  @override
  bool updateShouldNotify(ShellScope old) => old.api != api;
}
