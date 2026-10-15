import 'package:flutter/services.dart';
import '../theme/tokens.dart';

/// M2's buzz(), as the plan maps it: selection for detents, tabs and jumps; light for add; rigid (heavy) for remove; success
/// (a light then a medium pulse) for Log.
abstract final class Haptics {
  static void selection() => HapticFeedback.selectionClick();
  static void light() => HapticFeedback.lightImpact();
  static void add() => HapticFeedback.lightImpact();
  static void remove() => HapticFeedback.heavyImpact();
  /// M2's `buzz([12, 60, 24])`: two pulses, the second one firmer, 72 ms after the first.
  static void log() {
    HapticFeedback.lightImpact();
    final ms = M2Layout.buzzLogGap;
    Future<void>.delayed(Duration(milliseconds: (ms).round()), HapticFeedback.mediumImpact);
  }
}
