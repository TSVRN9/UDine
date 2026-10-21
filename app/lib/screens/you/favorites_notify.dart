import 'package:flutter/widgets.dart';

import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// `alertRows`: "Notify me" at the top of Favorites. A menu feature, not the ledger's, so it stays with tracking off. A tap raises the OS's own
/// sheet; denied (or revoked) hangs an Open Settings under the line.
class NotifyRow extends StatelessWidget {
  const NotifyRow({super.key});
  @override
  Widget build(BuildContext context) {
    final m = AppScope.of(context).alerts;
    return ListenableBuilder(
      listenable: m,
      builder: (context, _) {
        final button = m.denied;
        final line = button ? 'Notifications are off for UDine' : "When a favorite is on today's menu";
        return Container(
          margin: const EdgeInsets.only(bottom: M2Space.part),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            CheckRow(label: 'Notify me', line: line, on: m.checked, hang: button, last: true, onChanged: (_) { Haptics.selection(); m.toggle(); }),
            if (button) Padding(padding: const EdgeInsets.only(top: M2Layout.hangGap, bottom: M2Layout.hangFoot), child: Button(kind: ButtonKind.outlineDark, label: 'Open Settings', onTap: m.openSettings)),
          ]),
        );
      },
    );
  }
}
