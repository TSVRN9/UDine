// Captures copied verbatim from the inline constants in shared/src/content.test.ts (the live responses it cites).

/// People's Organic Coffee breakfast_menu: bare <p>Dish</p> runs.
const peoplesOrganicBreakfastMenu =
    '<p>Bacon Croissant</p><p>Veggie Croissant</p><p>Turkey &amp; Bacon</p><p>Breakfast Brioche</p><p>Quiche, Broccoli</p><p>Quiche, Ham</p><p>Antioxidant</p><p>Salad Strawberry Pecan</p>';

/// Argo Tea breakfast_menu: one <p>, <br>-separated, first line a <strong> section heading.
const argoTeaBreakfastMenu =
    '<p><strong>Sample Menu items:</strong><br />Black tea Hot or Iced<br />Green tea Hot or Iced<br />Earl Gray tea Hot or Iced<br />Freshly brewed coffee Hot or Iced<br />Cappuccino<br />Caffe Mocha<br />Chai hot or iced<br />Teappuccino hot or iced<br />Mate Late Hot or Iced<br />Matcha Vanilla Latte hot or iced<br />Green Tea Ginger Twist hot or iced<br />Bubble Tea<br />Tea Sparkle<br /><br />Blueberry Muffin<br />Macarons<br />Croissants<br />Paninis<br />Raw Bars</p>';

/// babyBerk breakfast_menu: a PDF link, not an item list.
const babyBerkBreakfastMenu =
    '<p><a href="https://umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf" target="_blank">Baby Berk Menu</a></p>';

/// The Commonwealth Restaurant breakfast_menu (get_infov2, 2026-10-13): four PDF links, one per <p>. Link text and URL shape as live; the file
/// names are shortened.
const commonwealthBreakfastMenu =
    '<p><a href="https://www.umassdining.com/sites/default/files/2026-10/Commonwealth%20Fall%2026%20LUNCH%20Menus.pdf" target="_blank">Click here for the Lunch Menu</a></p>'
    '<p><a href="https://www.umassdining.com/sites/default/files/2026-10/Commonwealth%20Fall%2026%20LITE%20FARE%20Menus.pdf" target="_blank">Click here for the Lite Fare Menu</a></p>'
    '<p><a href="https://www.umassdining.com/sites/default/files/2026-10/Commonwealth%20Fall%2026%20DINNER%20Menus.pdf" target="_blank">Click here for the Dinner Menu</a></p>'
    '<p><a href="https://www.umassdining.com/sites/default/files/2026-10/Commonwealth%20Fall%2026%20DESSERT%20Menus.pdf" target="_blank">Click here for the Dessert Menu</a></p>';

/// BR_SEPARATED_MENU_SHAPE (Argo/Peet's/Courtside shape).
const brSeparatedMenu = '<p>Chai Latte \$3.75<br>Matcha Latte \$4.25<br>Green Tea \$2.50<br>Black Tea</p>';

/// ALL_BOLD_MENU_SHAPE (defensive, not a live capture).
const allBoldMenu = '<p><strong>Chai Latte \$3.75</strong></p><p><strong>Matcha Latte \$4.25</strong></p>';

/// "Summer Hours", the sample from docs/apk-reverse-engineering.md used by the "event mapping" test.
const summerHoursEvent = {
  'title': 'Summer Hours',
  'featured_image': 'https://umassdining.com/sites/default/files/events/Summer%20Hours%20Banner_0.jpg',
  'pdf_link': 'https://umassdining.com/sites/default/files/events/Summer%202026%20Hours%20-%20Harvest%20Update.jpg',
  'external_link': '',
  'expiration_date': 1788148800,
  'is_featured': '0',
};
