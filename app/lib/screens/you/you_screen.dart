import 'package:flutter/widgets.dart';

import '../../core/m2/history.dart';
import '../../core/m2/menu_view.dart' show isoFull, prefSummary;
import '../../core/m2/rank.dart' show rankPool;
import '../../core/store/log_book.dart';
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../plate/plate_sheet.dart' show plateBoard;
import 'day_page.dart';
import 'meal_sheet.dart';
import 'settings_pages.dart';
import 'you_parts.dart';

/// You: the date and the title, then Today (its totals and meals) and Earlier (one row per logged day, newest first; a row pushes the day).
/// On a database a newer build wrote there is no log to show, and the one line says so. Then the choices: Favorites, Dietary preferences,
/// "Which was better?" and Export, Campus, Show on dishes. The "Track what I eat" and Health rows go above them (Task 3 and `flutter-port-health`).
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
        listenable: Listenable.merge([?book, scope.prefs]),
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
                DayBlock(meals: meals, day: today, title: 'Today', titleOf: (m) => mealTitle(m, fx, book.cafeIds), onMeal: (m) => openMealSheet(context, at: m.loggedAt)),
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
              _Choices(top: top, book: book),
              SizedBox(height: M2Layout.listFoot + safeBottom(context)),
            ]),
          );
        },
      ),
    );
  }
}

/// The choices under Earlier (`renderYou`): one `.lrow` per page, then Campus and Show on dishes, each a `.sec`.
class _Choices extends StatelessWidget {
  const _Choices({required this.top, required this.book});
  final double top;
  final LogBook? book;

  @override
  Widget build(BuildContext context) {
    final prefs = AppScope.of(context).prefs, meals = book?.meals ?? const <LoggedMeal>[], days = loggedDays(meals).length, favs = prefs.favorites.length;
    Widget sec(List<Widget> children) => Padding(padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.secTop, M2Space.gutter, 0), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children));
    final rows = <(String, String, WidgetBuilder)>[
      ('Favorites', favs == 0 ? 'None yet' : '$favs ${favs == 1 ? 'dish' : 'dishes'}', (_) => FavoritesPage(top: top)),
      ('Dietary preferences', prefSummary(prefs.diet), (_) => DietPage(top: top)),
      if (book != null) ('Which was better?', '${rankPool(meals).length} dishes logged', (_) => RankPage(top: top)),
      if (days > 0) ('Export my data', '$days ${days == 1 ? 'day' : 'days'}', (_) => ExportPage(top: top)),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      sec([for (final (i, r) in rows.indexed) LRow(title: r.$1, subtitle: r.$2, last: i == rows.length - 1, onTap: () => Nav.push<void>(context, r.$3))]),
      sec([
        const SecHead('Campus'),
        CheckRow(label: 'Charles River Campus', line: 'Newton', on: prefs.charlesRiver, last: true, onChanged: (v) { Haptics.selection(); prefs.setCharlesRiver(v); }),
      ]),
      sec([
        const SecHead('Show on dishes'),
        CheckRow(label: 'Healthfulness', lead: const ScoreBadge(kind: ScoreKind.health, value: 5, size: ScoreSize.sheet), on: prefs.scores.health, onChanged: (v) { Haptics.selection(); prefs.setScore(health: v); }),
        CheckRow(label: 'Carbon rating', lead: const ScoreBadge(kind: ScoreKind.carbon, value: 'B', size: ScoreSize.sheet), on: prefs.scores.carbon, last: true, onChanged: (v) { Haptics.selection(); prefs.setScore(carbon: v); }),
      ]),
    ]);
  }
}
