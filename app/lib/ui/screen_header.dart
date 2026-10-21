import 'dart:math' as math;
import 'package:flutter/widgets.dart';
import '../theme/tokens.dart';
import '../motion/fade_through.dart';
import 'back_button.dart';

/// The maroon header every tab and page opens with. `title`: the deep-maroon head of Halls and You (`.hhead`, `.yhead`): a row with
/// the UDine mark and/or the date, then the 52 dp title. `page`: the maroon bar of a pushed page (`.pbar`): back, then the title.
class ScreenHeader extends StatelessWidget {
  final double top;
  final String? title, date, mark;
  final double bottomPad;
  final VoidCallback? onBack;
  final bool page, dateLeft;
  final Color barColor;
  /// `dateLeft`: the date alone on the left, as You's header has it (`.yhead .date`); otherwise the mark left and the date right.
  const ScreenHeader.title({super.key, required this.top, required String this.title, this.date, this.mark, this.bottomPad = M2Layout.headPadBottom, this.dateLeft = false})
      : page = false, onBack = null, barColor = M2Color.vm;
  const ScreenHeader.page({super.key, required this.top, required String this.title, required this.onBack, this.barColor = M2Color.vm})
      : page = true, date = null, mark = null, bottomPad = 0, dateLeft = false;

  @override
  Widget build(BuildContext context) {
    if (page) {
      return Container(
        color: barColor, height: top + M2Layout.barH, padding: EdgeInsets.only(top: top, left: M2Layout.backLeft),
        child: Row(children: [
          BackButton(onTap: onBack, shadow: false),
          Expanded(child: Padding(padding: const EdgeInsets.only(left: M2Layout.pageTitleGap, right: M2Space.action), child: Text(title!, maxLines: 1, overflow: TextOverflow.ellipsis, style: M2Text.section.style(M2Color.white)))),
        ]),
      );
    }
    return GroundMark(child: Container(
      color: M2Color.dm,
      padding: EdgeInsets.fromLTRB(M2Space.gutter, top + M2Layout.headerPadTop, M2Space.gutter, bottomPad),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(
          height: M2Layout.brandRowH * math.max(1, MediaQuery.textScalerOf(context).scale(1)), // 30 dp at 1.0; the row's text is taller than 30 when it scales
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
            if (mark != null) Text(mark!, style: M2Text.brand.normal().style(M2Color.gold) /* `.brand` sets no line-height: the 32.6 dp normal line puts its baseline 3 dp lower than m2.json's 26 */) else if (dateLeft && date != null) Text(date!, style: M2Text.date.style(M2Color.onDm)) else const SizedBox.shrink(),
            if (!dateLeft && date != null) Flexible(child: Text(date!, maxLines: 1, overflow: TextOverflow.ellipsis, style: M2Text.date.style(M2Color.onDm))),
          ]),
        ),
        Padding(padding: const EdgeInsets.only(top: M2Layout.titleGap), child: Semantics(header: true, child: Text(title!, style: M2Text.hallTitle.style(M2Color.white)))),
      ]),
    ));
  }
}
