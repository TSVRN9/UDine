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
  static const secTop = 22.0; // `.sec` padding-top (m2.json's sectionTop says 26, drawn by RN; M2's DOM measures 22 from the last band)
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
  static const statusMin = 20.0;
  static const letterTop = 26.0; // `#mhead .let` top: var(--st) + 26
  static const backBtn = 48.0; // `.icon`
  static const backLeft = 4.0; // `#mctl` padding-left
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
  static const dashOn = 3.0, dashOff = 3.0; // a 1px dashed border: 3 on, 3 off
  static const markH = 30.0, markPadL = 10.0, markPadR = 12.0, markGap = 6.0, markGlyph = 16.0; // `.mk`, `.gl`
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
  static const chev18 = 18.0, chevThick = 2.4; // `.swbtn svg`, `.dayc svg`
  static const statusChevron = 14.0, statusPadV = 13.0, statusPadR = 16.0, statusGapH = 5.0, statusMarginTop = -6.0, statusMarginBottom = -13.0; // `#mts` (padding 12 / margin -5 -12 in M2: a 42 dp target; one more each way makes it 44, the line and the layout where they were)
  static const histBottom = 10.0, histH = 30.0; // `.hist`
  // sheets (`.sheet`, `.grab`, `.sbody`)
  static const grabH = 22.0, grabW = 40.0, grabBar = 5.0; // `.grab`
  static const sheetTop = 8.0; // top detent: --st + 8
  static const sheetBottom = 24.0; // `.sbody` padding-bottom (plus --sb)
  static const sheetMaxFrac = 0.86; // contentH is capped at 86% of the frame
  static const chevronShadow = Color.fromRGBO(36, 10, 14, 0.65); // not in tool/m2.json
  static const chevronShadowDy = 1.0, chevronShadowSigma = 1.0; // `#mctl .icon svg{filter: drop-shadow(0 1px 2px rgba(36,10,14,.65))}`: blur 2 = sigma 1
  static const checkSize = 26.0, checkRadius = 6.0, checkRing = 2.0, checkStroke = 2.5, checkW = 12.0, checkH = 7.0, checkLift = 2.0; // `.check i`
  static const pageTitleGap = 2.0; // `.pbar` gap
  // the hall header's title block (`.mt`) and the compact bar (`paint`: NB, NS)
  static const titleBottomCafe = 22.0; // `#menu.cafe .mt{bottom: 22px}`
  static const nameMinFit = 26.0; // `fitName`: a long café name shrinks to fit, never below this
  static const nameBarTop = 38.0; // `measureXF`: the collapsed name's bottom sits at --st + 38
  static const stationRowH = 48.0; // `#mtabs`, `#mswitch` height
  static const boardW = 350.0, boardGap = 3.0, boardLampGap = 2.0, boardRadius = 0.6; // `histSVG`: viewBox 350 x 30, gap 3, lg 2, rx .6
  static const statusChevronStroke = 2.0; // `#mts .sch`
  // `.tg`'s baseline is the bottom of its glyph (an inline-grid takes its first item's), 3 dp below the text's: 13 dp from the patch's top
  // Chrome snaps the line box to whole dp (22 where the arithmetic gives 22.5); Flutter does not, so the patch's baseline sits
  // patchSnap lower than the rule says
  static const patchSnap = 1.0;
  static const patchBaseline = (patch + patchGlyph) / 2 - patchDrop + patchSnap;
  // the list's other rows (`.gnote`, `.mst`)
  static const gnotePadTop = 12.0, gnotePadBottom = 4.0; // `.gnote` padding 12 20 4
  static const stateBottom = 8.0; // `.mst` padding-bottom
  static const sheetTitleTop = 2.0, sheetTitleBottom = 6.0; // `.sh1` margin 2 0 6
  static const optionH = 48.0, optionEdge = 4.0, optionCount = 16.0; // `#stidx button`, `#days .day`, `.c`
  static const schedNameTop = 2.0, schedRowTop = 6.0, schedPayTop = 10.0, schedDescTop = 20.0, schedDaysTop = 16.0; // `.schn`, `.schw`, `.schp`, `.schd`, `#days`
  static const mwsPadBottom = 10.0, mwsPadLeft = 36.0, mwsTop = -4.0, evRowH = 44.0; // `#days .mws`
  static const landingSlack = 12.0; // `openSched`: the chosen day ends 12 dp above the sheet's lower edge
  // the nutrition label and ratings panel (`.label`, `.grades`, `.sscale`)
  static const dvMin = 38.0; // `.label .lr .dv` min-width: 3ch of 16 dp Oswald
  static const labelTitleTop = 2.0, labelTitleBottom = 4.0, servingPad = 6.0, calPadTop = 2.0, calPadBottom = 4.0;
  static const scaleGap = 3.0, scaleOnPad = 2.0, scaleNumBar = 7.0, scaleBar = 4.0, scaleBarInset = 1.0, hscaleW = 14.0, cscaleW = 17.0;
  static const ratingPad = 10.0, gradeNoteTop = 6.0;
  // the dish sheet (`.dish`)
  static const dishHeadTop = 4.0, dishHeadBottom = 4.0; // `.dhd` padding 0 20 4, `.dn` margin 4 0 0
  static const dsvTop = 4.0, dalTop = 8.0, dadd = 16.0, whereTop = 24.0, wlGap = 16.0, wtBottom = 8.0, labelTop = 24.0, gradesTop = 12.0; // `.dsv`, `.dal`, `.dadd`, `.where`, `.wl+.wl`, `.wt`, `.facts`, `.facts.grades`
  static const ingTop = 24.0, ingBottom = 8.0, ingLines = 3.0, ingMore = 44.0, ingMoreTop = 2.0; // `.ingh`, `.ing`, `.ingmore` (40 in M2: 44 here, a touch target)
  static const shadowBlur = 14.0, shadowSpread = -8.0, shadowDy = 10.0, stuckAt = 4.0; // `.dish.stuck .dhd`
  // the plate bar and sheet (`#bar`, `.prow`, `.ptabs`, `.facts`)
  static const barMin = 68.0, barPadTop = 8.0, barPadRight = 12.0, barGap = 12.0, barL2Top = 2.0, barNumGap = 2.0, barUnitGap = 12.0; // `#bar .in`, `.l2`
  static const dotsTop = 5.0, dotSize = 5.0, dotGap = 5.0, peekInset = 10.0, peekH = 5.0, peekTop = -5.0; // `#bar .dots`, `.peek`
  static const logAtPad = 14.0; // `.gbtn` in choose mode
  static const plateTabsInset = -8.0, plateTabsBottom = 4.0, plateTabPad = 10.0, plateTabUnder = 3.0, plateTabUnderBottom = 4.0, plateTabGap = 4.0; // `.ptabs`
  static const prowMin = 64.0, prowGap = 8.0, prowMetaTop = 3.0; // `.prow`
  static const plateBodyTop = 4.0, factsMargin = 16.0; // `#psheet .sbody` padding-top, `.sheet .facts` margin
  static const midFrac = 0.36; // the plate sheet's resting line: 36% of the frame down
  static const factCalBottom = 7.0, factRowTop = 7.0, factRowBottom = 5.0; // `.facts .cal`, `.nr`
  static const peekRadius = 3.0; // `.peek` border-radius 3 3 0 0
  // You and its pages (`.yhead`, `.pbody`, `.dh`)
  static const youHeadBottom = 18.0; // `.yhead` padding-bottom
  static const pbodyTop = 8.0, pbodyBottom = 20.0, dietTop = 22.0, dietGroupTop = 28.0; // `.pbody` padding 8 20 20, `.h3{margin:22px 0 4px}` wins over `.dh{margin-top:12px}` at equal specificity; `.dh~.dh` 28
  static const mealCalGap = 6.0; // `.lrow .mc` gap
  static const listFoot = 150.0; // `.pad-b`: 150 + --sb, under every list, clearing the plate bar
  static const plateMidPad = 16.0; // the plate sheet's resting height fits its content, the bar and 16 (`psheet` mid in src.html)
  static const safeTopMin = 24.0; // `--st: max(24px, env(safe-area-inset-top))`
  static const plateFoot = 84.0; // `#psheet .sbody` padding-bottom: 84 + --sb, the room that clears the bar
  static const todayTop = 20.0; // You's Today section: `style="padding-top:20px"` on its `.sec`
  static const firstScreen = 14; // list items drawn while the container opens (a screenful and a half)
  static const rowTall = 79.0, noteRow = 53.0, ghostRows = 14; // typical heights for a guess at an unbuilt row; the rows a meal change copies
  static const factsFrame = 2.0, factsPadX = 12.0, factsPadTop = 4.0, factsPadBottom = 6.0; // `.facts` border 2, padding 4 12 6
}
