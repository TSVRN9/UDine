import 'package:flutter/widgets.dart';

import '../../core/m2/history.dart';
import '../../core/m2/menu_view.dart' show isoFull;
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../plate/plate_sheet.dart' show plateBoard;
import 'meal_sheet.dart';
import 'you_parts.dart';

/// A past day (M2 `pageContent('day')`): the maroon bar with the date, then that day's totals and meals. A meal opens its sheet.
class DayPage extends StatelessWidget {
  const DayPage({super.key, required this.top, required this.day});
  final double top;
  final String day;

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), book = scope.log!, fx = plateBoard(scope.repo.now());
    return ColoredBox(
      color: M2Color.chalk,
      child: Column(children: [
        ScreenHeader.page(top: top, title: isoFull(day), onBack: () => Navigator.of(context).maybePop()),
        Expanded(
          child: ListenableBuilder(
            listenable: book,
            builder: (context, _) => SingleChildScrollView(
              physics: const ClampingScrollPhysics(),
              padding: const EdgeInsets.only(top: M2Layout.pbodyTop, left: M2Layout.pageSecInset - M2Space.gutter, right: M2Layout.pageSecInset - M2Space.gutter),
              child: Column(children: [
                DayBlock(meals: book.meals, day: day, title: null, titleOf: (m) => mealTitle(m, fx), onMeal: (m) => openMealSheet(context, at: m.loggedAt)),
                SizedBox(height: M2Layout.pbodyBottom + M2Layout.listFoot + safeBottom(context)),
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}
