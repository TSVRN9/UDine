import 'package:flutter/widgets.dart';

import '../../core/m2/board.dart' show MenuItem, M2MenuItem, clockMeal, dishKey, halls;
import '../../core/saved_food.dart';
import '../../core/serving_text.dart';
import '../dish/food_sheet.dart';
import '../../core/m2/plate.dart' show hallLabel;
import '../../core/m2/rank.dart';
import '../../core/ranking.dart';
import '../../core/types.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../plate/plate_sheet.dart' show plateBoard;
import 'you_parts.dart';

/// A pushed page of You (`.page`): the maroon bar with its title, then the body on chalk.
class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key, required this.top, required this.title, required this.child});
  final double top;
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => ColoredBox(
        color: M2Color.chalk,
        child: Column(children: [
          ScreenHeader.page(top: top, title: title, onBack: () => Navigator.of(context).maybePop()),
          Expanded(
            child: SingleChildScrollView(
              physics: const ClampingScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.pbodyTop, M2Space.gutter, 0),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [child, SizedBox(height: M2Layout.pbodyBottom + M2Layout.listFoot + safeBottom(context))]),
            ),
          ),
        ]),
      );
}

/// A line of `.empty` copy inside a page body.
class _Empty extends StatelessWidget {
  const _Empty(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: M2Layout.emptyTop, bottom: M2Layout.emptyBottom),
        child: Text(text, style: M2Text.empty.style(M2Color.slate)),
      );
}

/// Dietary preferences (`pageContent('diet')`): Only show, then Avoid. A tap is stored at once, as RN's `food_preferences`.
class DietPage extends StatelessWidget {
  const DietPage({super.key, required this.top});
  final double top;

  @override
  Widget build(BuildContext context) {
    final prefs = AppScope.of(context).prefs;
    return SettingsPage(
      top: top,
      title: 'Dietary preferences',
      child: ListenableBuilder(
        listenable: prefs,
        builder: (context, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(padding: const EdgeInsets.only(top: M2Layout.dietTop, bottom: M2Layout.h3Bottom), child: Semantics(header: true, child: Text('Only show', style: M2Text.section.style(M2Color.dm)))),
          const OnlyShowRows(),
          Padding(padding: const EdgeInsets.only(top: M2Layout.dietGroupTop, bottom: M2Layout.h3Bottom), child: Semantics(header: true, child: Text('Avoid', style: M2Text.section.style(M2Color.dm)))),
          const AvoidRows(),
        ]),
      ),
    );
  }
}

/// Favorites: the dishes starred, each with where it is at lunch today (the halls whose menu carries it, read through the repository's
/// background prefetch, as Search does; a hall that did not answer is left out).
class FavoritesPage extends StatefulWidget {
  const FavoritesPage({super.key, required this.top});
  final double top;
  @override
  State<FavoritesPage> createState() => _FavoritesPageState();
}

class _FavoritesPageState extends State<FavoritesPage> {
  Map<String, List<String>>? _lunch; // dish key -> the halls (W F H B) serving it at lunch today

  @override
  void initState() {
    super.initState();
    final repo = AppScope.of(context).repo, day = repo.today;
    repo.prefetchMenus([for (var t = 1; t <= halls.length; t++) (t, day)]).then((got) {
      final at = <String, List<String>>{};
      for (var t = 1; t <= halls.length; t++) {
        for (final d in got[(t, day)] ?? const <MenuItem>[]) {
          if (d.mealPeriod == MealPeriod.lunch) (at[d.key] ??= []).add(halls[t - 1]);
        }
      }
      if (mounted) setState(() => _lunch = at);
    });
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), prefs = scope.prefs, fx = plateBoard(scope.repo.now());
    return SettingsPage(
      top: widget.top,
      title: 'Favorites',
      child: ListenableBuilder(
        listenable: prefs,
        builder: (context, _) {
          final f = prefs.favorites.toList();
          if (f.isEmpty) return const _Empty("Star a dish from its details and it shows up here, with where it's served today.");
          String? line(String n) {
            if (n.startsWith('f:')) return null; // (a family is served at cafés, whose menus this page does not read)
            final at = _lunch?[dishKey(n)];
            return _lunch == null ? null : at == null ? 'Not on lunch today' : 'At lunch now at ${hallLabel(fx, at)}';
          }

          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final (i, n) in f.indexed) LRow(title: n.startsWith('f:') ? n.substring(2) : n, subtitle: line(n), chevron: false, last: i == f.length - 1)]);
        },
      ),
    );
  }
}

/// Your foods (`pageContent('foods')`): every saved food, newest first, each opening its sheet. Deleting one from its sheet takes it off here.
class FoodsPage extends StatelessWidget {
  const FoodsPage({super.key, required this.top});
  final double top;

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), book = scope.foods;
    return SettingsPage(
      top: top,
      title: 'Your foods',
      child: ListenableBuilder(
        listenable: Listenable.merge([?book]),
        builder: (context, _) {
          final foods = book?.foods ?? const <SavedFood>[];
          if (foods.isEmpty) return const _Empty("Foods you add that aren't on a menu are kept here.");
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            for (final (i, f) in foods.indexed)
              LRow(
                title: f.name, subtitle: '${fc(f.nutrition.calories)} cal, ${servingText(f.serving)}', last: i == foods.length - 1,
                onTap: () => openFoodSheet(context, food: f, meal: clockMeal(scope.repo.now())),
              ),
          ]);
        },
      ),
    );
  }
}

/// Export my data: JSON or CSV, every device-local table, through the OS share sheet.
class ExportPage extends StatelessWidget {
  const ExportPage({super.key, required this.top});
  final double top;

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), book = scope.log;
    Future<void> send(bool json) async {
      if (book == null) return;
      await scope.share(await book.exportFiles(json: json));
    }

    return SettingsPage(
      top: top,
      title: 'Export my data',
      child: Padding(
        padding: const EdgeInsets.only(top: M2Layout.vsTop),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Button(kind: ButtonKind.primary, label: 'Export JSON', expand: true, onTap: () => send(true)),
          const SizedBox(height: M2Layout.vsGap),
          Button(kind: ButtonKind.line, label: 'Export CSV', expand: true, onTap: () => send(false)),
        ]),
      ),
    );
  }
}

/// "Which was better?": two dishes from the user's own log, one tap picks; when every dish has met the rest, "Your ranking". Picks move RN's
/// Elo rows (`ranked_dishes`, `ranked_foods`), so what was ranked in RN is where this starts.
class RankPage extends StatefulWidget {
  const RankPage({super.key, required this.top});
  final double top;
  @override
  State<RankPage> createState() => _RankPageState();
}

class _RankPageState extends State<RankPage> {
  List<RankedDish>? _ranked;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    AppScope.of(context).log?.rankedDishes().then((r) {
      if (mounted) setState(() => _ranked = r);
    });
  }

  Future<void> _pick(LoggedDish win, LoggedDish lose) async {
    if (_busy) return;
    _busy = true;
    Haptics.light();
    try {
      final r = await AppScope.of(context).log!.pick(win, lose);
      if (mounted) setState(() => _ranked = r);
    } catch (e, st) {
      debugPrint('udine: a pick did not save: $e\n$st'); // the pair stays on screen: the next tap tries again
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final book = AppScope.of(context).log;
    final ranked = _ranked;
    if (book == null || ranked == null) return SettingsPage(top: widget.top, title: 'Which was better?', child: const SizedBox.shrink());
    return ListenableBuilder(
      listenable: book,
      builder: (context, _) {
        final pool = rankPool(book.meals), pair = nextPair(pool, ranked);
        if (pair != null) {
          final (a, b) = pair;
          return SettingsPage(
            top: widget.top,
            title: 'Which was better?',
            child: Padding(
              padding: const EdgeInsets.only(top: M2Layout.vsTop),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                _Choice(a.dishName, () => _pick(a, b)),
                const SizedBox(height: M2Layout.vsGap),
                Center(child: Text('or', style: M2Text.statusSm.style(M2Color.slate))),
                const SizedBox(height: M2Layout.vsGap),
                _Choice(b.dishName, () => _pick(b, a)),
              ]),
            ),
          );
        }
        final order = rankedOrder(pool, ranked);
        return SettingsPage(
          top: widget.top,
          title: 'Your ranking',
          child: pool.length > 1
              ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final (i, d) in order.indexed) LRow(title: '${i + 1}. ${d.dishName}', chevron: false, last: i == order.length - 1)])
              : const _Empty('Log a couple of meals and you can rank what you ate.'),
        );
      },
    );
  }
}

/// `.vs button`: a white 96 dp tile ringed in hair, the dish's name in Oswald.
class _Choice extends StatelessWidget {
  const _Choice(this.name, this.onTap);
  final String name;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Press(
        scale: true, label: name, onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: M2Layout.vsMin),
          padding: const EdgeInsets.all(M2Layout.vsPad),
          alignment: Alignment.centerLeft,
          decoration: BoxDecoration(color: M2Color.white, borderRadius: const BorderRadius.all(Radius.circular(M2Radius.button)), border: Border.all(color: M2Color.hair, width: M2Layout.rule)),
          child: ExcludeSemantics(child: Text(name, style: M2Layout.vsName.style(M2Color.dm))),
        ),
      );
}
