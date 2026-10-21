import 'package:flutter/widgets.dart';

import '../../shell/app_scope.dart';
import '../../shell/health_book.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'you_parts.dart' show TrackRow;

/// `checkRow('health')` and its `.hrow` (M2 `trackRows`): Write to Health Connect (Apple Health on iOS), "Each meal you log". Denied and revoked
/// say so on the second line and hang an outlined button under it. Absent when Health Connect can't be asked.
class HealthRow extends StatelessWidget {
  const HealthRow({super.key, required this.health});
  final HealthBook health;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
        listenable: health,
        builder: (context, _) {
          final st = health.state;
          if (st == HealthRowState.hidden) return const SizedBox.shrink();
          final stuck = st == HealthRowState.denied || st == HealthRowState.revoked;
          final line = switch (st) {
            HealthRowState.denied => "${health.name} didn't allow it",
            HealthRowState.revoked => 'Not allowed in ${health.name} any more',
            _ => 'Each meal you log',
          };
          return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            CheckRow(label: 'Write to ${health.name}', line: line, on: st == HealthRowState.allowed, last: true, hang: stuck, onChanged: (_) { Haptics.selection(); health.tap(); }),
            if (stuck)
              Padding(
                padding: const EdgeInsets.only(top: M2Layout.hangGap, bottom: M2Layout.hangFoot),
                child: Align(alignment: Alignment.centerLeft, child: Button(kind: ButtonKind.outlineDark, label: health.settingsLabel, onTap: health.openSettings)),
              ),
          ]);
        },
      );
}

/// The Track row and, while tracking is on, the Health row under it.
class TrackAndHealth extends StatelessWidget {
  const TrackAndHealth({super.key});
  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), prefs = scope.prefs, health = scope.health;
    if (health == null) return const TrackRow(last: true);
    return ListenableBuilder(
      listenable: Listenable.merge([prefs, health]),
      builder: (context, _) {
        // (the hairline under Track stays while the Health row lifts away or comes back)
        return LiftBuilder(
          lift: prefs.lift, rest: prefs.track,
          builder: (_, f, _) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            TrackRow(last: health.state == HealthRowState.hidden || (f.size == 0 && f.alpha == 0)),
            LiftFold(lift: prefs.lift, rest: prefs.track, child: HealthRow(health: health)),
          ]),
        );
      },
    );
  }
}
