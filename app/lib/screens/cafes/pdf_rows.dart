import 'package:flutter/widgets.dart';

import '../../core/content.dart' show RetailMenuPdf, menuName;
import '../../motion/routes.dart';
import '../../shell/app_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'pdf_page.dart';

/// The "Menus" rows (R11 §3): one per PDF the café lists, in the feed's order, named by the link's own words cut to the menu's name. A row
/// pushes the menu's page. Offline, a menu not kept on the phone says "Not saved" in slate.
class PdfRows extends StatefulWidget {
  const PdfRows({super.key, required this.pdf, required this.offline, required this.top});
  final RetailMenuPdf pdf;
  final bool offline;
  final double top;
  @override
  State<PdfRows> createState() => _PdfRowsState();
}

class _PdfRowsState extends State<PdfRows> {
  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context), links = widget.pdf.links;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      for (var i = 0; i < links.length; i++)
        _row(
          title: menuName(links[i].label), last: i == links.length - 1,
          notSaved: widget.offline && !(scope.repo.pdfs?.file(links[i].url).existsSync() ?? false),
          onTap: () async {
            await Nav.push<void>(context, (_) => PdfMenuPage(top: widget.top, url: links[i].url, label: links[i].label, cache: scope.repo.pdfs, open: scope.pdfOpen, onRetry: scope.repo.retryNetwork));
            if (mounted) setState(() {}); // a menu opened just now is kept: its row no longer says Not saved
          },
        ),
    ]);
  }

  Widget _row({required String title, required bool last, required bool notSaved, required VoidCallback onTap}) => Press(
        overlay: M2Color.pressRow, onTap: onTap, label: notSaved ? '$title, Not saved' : title,
        child: Container(
          constraints: const BoxConstraints(minHeight: M2Layout.namesRowMin),
          decoration: BoxDecoration(border: last ? null : const Border(bottom: BorderSide(color: M2Color.hair))),
          child: ExcludeSemantics(
            child: Row(children: [
              Expanded(child: Text(title, style: M2Text.rowName.style(M2Color.ink))),
              if (notSaved) ...[Text('Not saved', style: M2Text.meta.style(M2Color.slate)), const SizedBox(width: M2Layout.mcGap)],
              const Chevron(),
            ]),
          ),
        ),
      );
}
