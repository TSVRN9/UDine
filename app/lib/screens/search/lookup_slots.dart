import 'package:flutter/widgets.dart';

import '../../core/m2/where.dart' show fmtT;
import '../../core/hours.dart' show easternWall;
import '../../data/packaged_search.dart' show LookupPhase;
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// "Search UMass Dining for “x”" (`.lkb`): the lookup by hand, a maroon text button the width of the screen.
class LookupButton extends StatelessWidget {
  const LookupButton({super.key, required this.query, required this.onTap});
  final String query;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final label = 'Search UMass Dining for “$query”';
    return Press(
      label: label, onTap: onTap,
      child: Container(
        width: double.infinity, constraints: const BoxConstraints(minHeight: M2Size.tap), margin: const EdgeInsets.only(top: M2Layout.lkbTop),
        padding: const EdgeInsets.symmetric(horizontal: M2Space.gutter), alignment: Alignment.centerLeft,
        child: ExcludeSemantics(child: Text(label, style: M2Text.link.style(M2Color.vm))),
      ),
    );
  }
}

/// `.lkst`: a state in the button's slot. [children] go under its padding (14 above, 4 below, 20 in).
class _Slot extends StatelessWidget {
  const _Slot({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.lkstTop, M2Space.gutter, M2Layout.lkstBottom),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
      );
}

Widget _kv(String text) => Padding(
      padding: const EdgeInsets.only(bottom: M2Layout.kvBottom),
      child: Semantics(liveRegion: true, child: Text(text, style: M2Layout.kv.style(M2Color.slate))),
    );

/// The Packaged group's wait: the indicator in a `.lkst` (after 400 ms; until then the slot is empty and nothing below moves).
class PackWait extends StatelessWidget {
  const PackWait({super.key});
  @override
  Widget build(BuildContext context) => const _Slot(children: [
        Center(child: Padding(padding: EdgeInsets.only(top: M2Layout.lkstSpinTop, bottom: M2Layout.lkstSpinBottom), child: Spinner(label: 'Searching packaged foods'))),
      ]);
}

/// "Packaged foods didn't load." with Try again, under the Packaged heading.
class PackFail extends StatelessWidget {
  const PackFail({super.key, required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => _Slot(children: [
        _kv("Packaged foods didn't load."),
        Button(kind: ButtonKind.line, size: ButtonSize.tap, label: 'Try again', onTap: onRetry),
      ]);
}

/// "Searching UMass Dining is paused until 1 PM.": the server's budget resets on the hour, in the hour the reader keeps.
String pausedLine(DateTime resetsAt) {
  final w = easternWall(resetsAt);
  return 'Searching UMass Dining is paused until ${fmtT('${w.hour % 12 == 0 ? 12 : w.hour % 12}:${w.minute.toString().padLeft(2, '0')} ${w.hour < 12 ? 'AM' : 'PM'}')}.';
}

/// The lookup's answer in the button's slot (none, failed, rate-limited, or the wait): what happened, and what to do.
class LookupStatus extends StatelessWidget {
  const LookupStatus({super.key, required this.phase, required this.query, this.resetsAt, required this.onRetry});
  final LookupPhase phase;
  final String query;
  final DateTime? resetsAt;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => switch (phase) {
        LookupPhase.loading => Container(
            height: M2Layout.lkstLoadH, padding: const EdgeInsets.only(top: M2Layout.lkstLoadTop), alignment: Alignment.topCenter,
            child: const Spinner(label: 'Searching UMass Dining'),
          ),
        LookupPhase.none => _Slot(children: [_kv('UMass Dining has nothing else called “$query”.')]),
        LookupPhase.limited => _Slot(children: [_kv(pausedLine(resetsAt!))]),
        _ => _Slot(children: [_kv("Couldn't reach UMass Dining."), Button(kind: ButtonKind.line, size: ButtonSize.tap, label: 'Try again', onTap: onRetry)]),
      };
}
