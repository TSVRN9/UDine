import 'package:flutter/widgets.dart';

import '../../core/m2/history.dart';
import '../../core/m2/menu_view.dart' show isoFull;
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../plate/plate_sheet.dart' show plateBoard;
import 'day_page.dart';
import 'meal_sheet.dart';
import 'you_parts.dart';

/// You: the date and the title, then Today (its totals and meals) and Earlier (one row per logged day, newest first; a row pushes the day).
/// On a database a newer build wrote there is no log to show, and the one line says so. The settings rows are `flutter-port-you` Task 2's.
class YouScreen extends StatelessWidget {
  const YouScreen({super.key, required this.top});
  final double top;

  static const newerDatabase = 'Your history was saved by a newer version of UDine. Update UDine to see it and keep logging.';

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), book = scope.log, fx = plateBoard(scope.repo.now());
    return ColoredBox(
      color: M2Color.chalk,
      child: ListenableBuilder(
        listenable: book ?? scope.prefs,
        builder: (context, _) {
          final today = book?.today ?? '', meals = book?.meals ?? const <LoggedMeal>[], earlier = [for (final d in loggedDays(meals)) if (d != today) d];
          return SingleChildScrollView(
            physics: const ClampingScrollPhysics(),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              ScreenHeader.title(top: top, title: 'You', date: isoFull(book?.today ?? scope.repo.today), dateLeft: true, bottomPad: M2Layout.youHeadBottom),
              if (book == null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.emptyTop, M2Space.gutter, M2Layout.emptyBottom),
                  child: Text(newerDatabase, style: M2Text.empty.style(M2Color.slate)),
                )
              else ...[
                DayBlock(meals: meals, day: today, title: 'Today', titleOf: (m) => mealTitle(m, fx), onMeal: (m) => openMealSheet(context, at: m.loggedAt)),
                if (earlier.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.secTop, M2Space.gutter, 0),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                      const SecHead('Earlier'),
                      for (final (i, d) in earlier.indexed)
                        LRow(title: isoFull(d), trailing: CalTrailing(dayTotal(meals, d).cal), last: i == earlier.length - 1, onTap: () => Nav.push<void>(context, (_) => DayPage(top: top, day: d))),
                    ]),
                  ),
              ],
              SizedBox(height: M2Layout.listFoot + safeBottom(context)),
            ]),
          );
        },
      ),
    );
  }
}
