import 'package:flutter/widgets.dart';

import '../../core/saved_food.dart';
import '../../theme/tokens.dart';
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
  Widget build(BuildContext context) {
    final n = food.nutrition;
    return ListRow(
      label: food.per100g ? '${food.name}, ${fc(n.knownCal)} calories per 100 grams' : '${food.name}, ${fc(n.knownCal)} calories, ${f1(n.knownProtein)} grams protein',
      onTap: onOpen,
      name: Badge.name(food.name, M2Text.rowName.style(M2Color.ink), badge: Badge.forDiet(food.diet)),
      meta: food.per100g ? CalPer100(cal: n.knownCal) : CalProtein(cal: n.knownCal, protein: n.knownProtein),
      // (`.lane` min-height 66: the control at its top, so a food's row is the size of a dish's)
      control: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: M2Layout.laneMin),
        child: Align(alignment: Alignment.topRight, widthFactor: 1, child: RowControl(qty: code, ghost: false, onAdd: onAdd, onInc: onInc, onDec: onDec)),
      ),
    );
  }
}
