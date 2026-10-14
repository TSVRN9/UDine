import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';

/// `--sb: max(10px, env(safe-area-inset-bottom))`: the bottom inset M2 draws under everything, never less than 10.
double safeBottom(BuildContext c) {
  final b = MediaQuery.paddingOf(c).bottom;
  return b < M2Layout.safeBottomMin ? M2Layout.safeBottomMin : b;
}

/// `--st: max(24px, env(safe-area-inset-top))`.
double safeTop(BuildContext c) {
  final t = MediaQuery.paddingOf(c).top;
  return t < M2Layout.safeTopMin ? M2Layout.safeTopMin : t;
}
