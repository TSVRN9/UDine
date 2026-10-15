import 'package:flutter/widgets.dart';

import '../../core/m2/board.dart' show Place;
import '../../core/content.dart' show RetailMenuPdf, htmlToText;
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import 'cafes_model.dart';

/// `.cbody`: a café without a dish menu. Description, then Menu (a names list, or what it doesn't list), then Add a custom food; a café
/// of PDFs puts the "Menus" rows first and the description last (R11 §3).
class CafeStandingBody extends StatelessWidget {
  final CafeBodyKind kind;
  final Place place;
  final Widget Function(BuildContext, RetailMenuPdf)? pdfRows;
  const CafeStandingBody({super.key, required this.kind, required this.place, this.pdfRows});

  @override
  Widget build(BuildContext context) {
    final pdf = kind is PdfBody;
    Widget desc(double top) => place.description.isEmpty ? const SizedBox.shrink() : Padding(padding: EdgeInsets.only(top: top), child: Text(htmlToText(place.description), style: M2Text.desc.style(M2Color.ink)));
    Widget h3(String t, double top) => Padding(padding: EdgeInsets.only(top: top, bottom: M2Layout.h3Bottom), child: Semantics(header: true, child: Text(t, style: M2Text.section.style(M2Color.dm))));
    return Padding(
      padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Space.cafeBodyTop, M2Space.gutter, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (!pdf) desc(0),
        switch (kind) {
          PdfBody(:final pdf) => pdfRows == null ? const SizedBox.shrink() : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [h3('Menus', M2Layout.h3Bottom), pdfRows!(context, pdf)]),
          NamesBody(:final items) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              h3('Menu', M2Layout.h3Gap),
              for (final i in items)
                Container(
                  constraints: const BoxConstraints(minHeight: M2Layout.namesRowMin),
                  decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: M2Color.hair))),
                  alignment: Alignment.centerLeft,
                  child: Row(children: [
                    Expanded(child: Text(i.name, style: M2Text.rowName.style(M2Color.ink))),
                    if (i.price != null) Text(i.price!, style: M2Text.meta.style(M2Color.slate)),
                  ]),
                ),
            ]),
          _ => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              h3('Menu', M2Layout.h3Gap),
              Padding(padding: const EdgeInsets.symmetric(vertical: M2Space.kvTop), child: Text("${place.name} doesn't list its menu in the app.", style: M2Text.sched.style(M2Color.slate))),
            ]),
        },
        Padding(padding: EdgeInsets.only(top: kind is NamesBody ? M2Space.group : pdf ? M2Space.eventBottom : 0), child: const Button(kind: ButtonKind.primary, label: 'Add a custom food', expand: true)),
        if (pdf) desc(M2Space.group),
      ]),
    );
  }
}
