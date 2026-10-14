import 'package:flutter/services.dart';

/// M2's buzz(), as the plan maps it: selection for detents, tabs and jumps; light for add; rigid (heavy) for remove; success
/// (medium) for Log.
abstract final class Haptics {
  static void selection() => HapticFeedback.selectionClick();
  static void light() => HapticFeedback.lightImpact();
  static void add() => HapticFeedback.lightImpact();
  static void remove() => HapticFeedback.heavyImpact();
  static void log() => HapticFeedback.mediumImpact();
}
