import 'package:flutter/painting.dart';

// Layout numbers the token file does not carry, each named for the M2 rule (src.html) it is copied from. A number that
// is in tool/m2.json lives there (m2_tokens.g.dart), not here.
abstract final class M2Layout {
  // Halls (M2 `.hhead`, `#bands`, `.sec`, `.lrow`)
  static const headerPadTop = 10.0; // `.hhead` padding-top: var(--st) + 10
  static const headPadBottom = 16.0; // `.hhead` padding-bottom
  static const brandRowH = 30.0; // `.hhead .r1`
  static const titleGap = 2.0; // `.hhead h1` margin-top
  static const secTitleGap = 4.0; // `.sec h2` margin-bottom
  static const listPadBottom = 120.0; // clears the plate bar
  static const areaRowMin = 56.0; // `.lrow` min-height
  static const areaMetaGap = 2.0; // `.lrow .b` margin-top
  static const areaCount = 4; // Newton is off in this build
  static const collapsedBar = 44.0; // the maroon bar under the status bar
  static const collapseStart = 40.0; // scroll offset where it begins to show
  static const collapseSpan = 24.0; // and the distance it takes
  // the hall page header (M2 `#mhead`, `.mt`, `#mctl`)
  static const headerH = 282.0; // HH = ST + 282
  static const barH = 52.0; // CH = ST + 52: the compact bar under the status inset
  static const topGradH = 80.0; // `.tgrad` height: var(--st) + 80
  static const bottomGradH = 240.0; // `.bgrad`
  static const titleBottom = 50.0; // `.mt` bottom
  static const statusGap = 7.0; // `.mt .st` margin-top
  static const statusMin = 20.0;
  static const letterTop = 26.0; // `#mhead .let` top: var(--st) + 26
  static const backBtn = 48.0; // `.icon`
  static const backLeft = 4.0; // `#mctl` padding-left
  static const backStroke = 2.2;
  // the band (M2 `.band`, `.pin`, `.bt`)
  static const bandCompact = 84.0; // `.band.pin`
  static const seam = 1.0; // `.band` margin-top
  static const statusGapBand = 7.0, statusGapPin = 6.0;
  static const busyTopBand = 6.0, busyTopHeader = 8.0; // `.bz`
  static const busyMaxHeader = 230.0;
  static const busyGap = 8.0, busyRunGap = 5.0;
  // `.meter`
  static const lampW = 5.0, lampH = 12.0, lampGap = 2.0, lampRadius = 1.0;
  // the chenille letter (`.let`, `.felt`, `.gold`)
  static const letterBox = 200.0, letterFont = 210.0, letterBaseline = 0.93;
  static const feltStroke = 12.0, stitchStroke = 1.5, stitchOn = 5.0, stitchOff = 4.0;
  static const letterBandTop = -6.0; // `.band .let`
  // the tab bar (`.tbar`)
  static const tabIcon = 24.0, tabGap = 3.0, tabIconStroke = 1.8;
  static const chevron = 18.0, chevronStroke = 2.2;
  static const backSize = 24.0;
  static const safeBottomMin = 10.0; // `--sb: max(10px, env(safe-area-inset-bottom))`
  // felt patches: gold felt with maroon stitching (`.tg`, `.mk`, `.hchip .hl`)
  static const patch = 20.0, patchGlyph = 12.0; // `.tg` size, `.tg .gl`
  static const patchLeft = 6.0; // `.tg` margin-left
  static const patchDrop = 3.0; // `.tg` vertical-align: -3px
  static const stitchInset = 2.0, stitchInnerRadius = 2.0; // `.tg::after`
  static const stitchW = 1.0, dashOn = 3.0, dashOff = 3.0; // a 1px dashed border
  static const markH = 30.0, markPadL = 10.0, markPadR = 12.0, markGap = 6.0, markGlyph = 16.0; // `.mk`, `.gl`
  static const markStitchInset = 3.0, markStitchRadius = 3.0; // `.mk::after`
  static const marksTop = 8.0, marksGap = 8.0; // `.dish .mks`, `.mks`
  static const hl = 28.0, hchipGap = 10.0, hchipPadL = 8.0, hchipPadR = 16.0; // `.hchip .hl`, `.hchip`
  static const hchipH = 44.0; // `.hchip`
  static const wcGap = 8.0; // `.wc`
  // buttons (`.btn`, `.gbtn`, `.obtn`, `.dirb`)
  static const btnL = 52.0, btnM = 48.0; // `.btn`, `.gbtn` heights (`.obtn`, `.dirb`, `.tbtn` are M2Size.tap)
  static const gbtnMinW = 84.0, gbtnPad = 18.0, obtnPad = 14.0, dirbPad = 16.0, tbtnPad = 12.0;
  static const rule = 1.5; // `.btn.line`, `.obtn`, `.add.ghost`, `.dirb` inset ring
  // the row (`.row`, `.add`, `.step`)
  static const rowPadTop = 6.0, rowPadRight = 8.0, rowGap = 8.0; // `.row` padding 6 8 6 20, gap 8
  static const rowMetaTop = 3.0, metaGapX = 10.0, metaGapY = 4.0, numGap = 8.0, numSpace = 4.0; // `.row .m`, `.mg`, `.gap`
  static const scoreGap = 6.0, scoreRise = 1.0; // `.sc`, `.row .m .sc{margin-block:-1px}`
  static const addSize = 48.0, ghostSize = 44.0, ghostMargin = 2.0, glyph = 20.0, glyphStroke = 2.4; // `.add`, `.add.ghost`, `.add svg`
  static const stepQ = 26.0; // `.step .q` min-width
  static const lane = 114.0; // the control lane: `.add` 48 + margin-left 66 = `.step` 44 + 26 + 44
  static const hairline = 1.0;
  // headings in the list (`.sth`, `.dietnote`)
  static const sthPadBottom = 6.0; // `.sth` padding: 0 20 6
  static const noteH = 4.0; // `.dietnote` padding 4 8 4 20
  static const noteGap = 8.0;
  // hall menu header rows (`#mtabs`, `#mswitch`, `.dayc`, `.swbtn`)
  static const rowH = 47.0; // `.swbtn`, `.dayc` height under the 1px rule
  static const tabPadX = 6.0, tabsPadX = 4.0; // `.mts button` padding, `.mts` padding
  static const underH = 3.0, underInset = 8.0; // `.mts .ul`, placeUL: translateX(left + 8) scaleX(width - 16)
  static const dayGap = 6.0, dayPadL = 16.0, dayPadR = 20.0; // `.dayc`
  static const swGap = 8.0; // `.swbtn` gap
  static const switchRule = 1.0; // `#mswitch` border-top
  static const chev18 = 18.0, chevThick = 2.4; // `.swbtn svg`, `.dayc svg`
  static const statusChevron = 14.0, statusPadV = 12.0, statusPadR = 16.0, statusGapH = 5.0, statusMarginTop = -5.0, statusMarginBottom = -12.0; // `#mts`
  static const histBottom = 10.0, histH = 30.0; // `.hist`
  static const bzTop = 8.0; // `.mt .bz`
  // sheets (`.sheet`, `.grab`, `.sbody`)
  static const grabH = 22.0, grabW = 40.0, grabBar = 5.0; // `.grab`
  static const sheetTop = 8.0; // top detent: --st + 8
  static const sbodyPad = 20.0; // `.sbody` padding
  static const sheetBottom = 24.0; // `.sbody` padding-bottom (plus --sb)
  static const sheetMaxFrac = 0.86; // contentH is capped at 86% of the frame
  static const chevronShadow = Color.fromRGBO(36, 10, 14, 0.65); // not in tool/m2.json
  static const chevronShadowDy = 1.0, chevronShadowSigma = 1.0; // `#mctl .icon svg{filter: drop-shadow(0 1px 2px rgba(36,10,14,.65))}`: blur 2 = sigma 1
  static const checkSize = 26.0, checkRadius = 6.0, checkRing = 2.0, checkStroke = 2.5, checkW = 12.0, checkH = 7.0, checkLift = 2.0; // `.check i`
  static const pageTitleGap = 2.0; // `.pbar` gap
}
