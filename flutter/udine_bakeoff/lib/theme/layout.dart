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
}
