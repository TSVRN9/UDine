import '../theme/tokens.dart';

// UMass Dining's photos are gitignored: tool/bakeoff_assets.sh copies them into assets/bakeoff/. A missing file draws
// nothing (the band's maroon ground shows), so a checkout without them still builds and tests.
const hallPhoto = {'W': 'worcester.jpg', 'F': 'franklin.jpg', 'H': 'hampshire.jpg', 'B': 'berkshire.jpg'};
/// A café's own location-card photo, by name (M2 `RIMG`); a café without one has the plain maroon header (M2 `nophoto`).
const cafePhoto = {
  'Paciugo': 'paciugo.jpg', 'Tavola': 'tavola.jpg', 'Yum! Bakery': 'yum-bakery.jpg', 'Green Fields': 'green-fields.jpg',
  'Tamales': 'tamales.jpg', 'Wasabi': 'wasabi.jpg', 'Deli Delish': 'deli-delish.jpg', 'Star Ginger': 'star-ginger.jpg',
  'The Grill': 'the-grill.jpg', "People's Organic Coffee": 'people-s-organic-coffee.jpg', 'Harvest Market': 'harvest-market.jpg',
  'UMass Store': 'umass-store.jpg', 'Worcester Café': 'worcester-caf.png', 'ISB Café': 'isb-caf.jpg', 'Morrill Café': 'morrill-caf.jpg',
  'Snack Overflow': 'snack-overflow.jpg', 'The Hub': 'the-hub.jpg', 'Newman Café': 'newman-caf.jpg',
  "Peet's Coffee & Tea": 'peet-s-coffee-tea.jpg', 'Procrastination Station': 'procrastination-station.jpg',
  'Whitmore Café': 'whitmore-caf.jpg', 'Carney Café': 'carney-caf.jpg', 'Post & Bean Café': 'post-bean-caf.jpg',
  'Hampshire Café': 'hampshire-caf.jpg', 'Argo Tea': 'argo-tea.jpg', 'Roots Café': 'roots-caf.jpg', 'Courtside Café': 'courtside-caf.jpg',
  'Terrace': 'terrace.png',
};

/// The asset path for a place's photo, or null.
String? photoOf(String key, String name) {
  final f = key.startsWith('c') ? cafePhoto[name] : hallPhoto[key];
  return f == null ? null : 'assets/bakeoff/${key.startsWith('c') ? 'retail/' : ''}$f';
}

/// Background-position x of the photo in a hall header (src.html .ph-W/F/H/B), as a fraction.
const photoPos = {'W': 0.72, 'F': 0.42, 'H': 0.6, 'B': 0.62};
/// The band's window into the header photo, as a fraction of header height (OFF, OFFC).
const photoOff = {'W': 0.3, 'F': 0.1, 'H': 0.24, 'B': 0.22};
const cafeOff = 0.3;
/// The chenille letter's text x inside its 200 px box (M2 `LX`, owner-approved round 10; RN logic/letters.ts).
const hallLx = letterX;

double headerHeight(double top) => top + 282;
double bandOff(String key, double top) => ((key.startsWith('c') ? cafeOff : photoOff[key]!) * headerHeight(top)).roundToDouble();
