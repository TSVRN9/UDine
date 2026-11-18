import 'package:flutter/widgets.dart';

import '../../core/saved_food.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../motion/track_layer.dart';
import '../../ui/ui.dart';
import '../hall/dish_row.dart' show CalPer100, CalProtein;

/// A food in Your foods, Packaged or UMass Dining (M2 `foodRow`): Search's row, whose lane holds only the control, because the food is not
/// served anywhere (a row says where, never where not). A per-100 g food's meta says so, and its + adds one 100 g serving.
class FoodRow extends StatelessWidget {
  const FoodRow({super.key, required this.food, required this.code, required this.onOpen, required this.onAdd, required this.onInc, required this.onDec});
  final SavedFood food;
  /// its quantity on the plate it would join, 0 for the plain +
  final double code;
  final VoidCallback onOpen, onAdd, onInc, onDec;

  @override
  Widget build(BuildContext context) => LiftBuilder(lift: AppScope.liftOf(context), builder: (context, f, _) {
        final n = food.nutrition, gone = f.size == 0 && f.alpha == 0;
        final lane = ConstrainedBox(
          constraints: const BoxConstraints(minHeight: M2Layout.laneMin),
          child: Align(alignment: Alignment.topRight, widthFactor: 1, child: RowControl(qty: code, ghost: false, onAdd: onAdd, onInc: onInc, onDec: onDec)),
        );
        return ListRow(
          label: gone ? food.name : food.per100g ? '${food.name}, ${fc(n.knownCal)} calories per 100 grams' : '${food.name}, ${fc(n.knownCal)} calories, ${f1(n.knownProtein)} grams protein',
          onTap: onOpen,
          name: Badge.name(food.name, M2Text.rowName.style(M2Color.ink), badge: Badge.forDiet(food.diet)),
          // (a food's line is only its figures: it closes with them)
          meta: Opacity(opacity: f.alpha, child: food.per100g ? CalPer100(cal: n.knownCal) : CalProtein(cal: n.knownCal, protein: n.knownProtein)),
          minHeight: M2Size.rowOff + (M2Size.row - M2Size.rowOff) * f.size, metaOpen: f.size,
          // (`.lane` min-height 66: the control at its top, so a food's row is the size of a dish's)
          control: gone ? null : f.size == 1 && f.alpha == 1 ? lane : ClipRect(child: Align(alignment: Alignment.topRight, heightFactor: f.size, child: Opacity(opacity: f.alpha, child: lane))),
        );
      });
}
