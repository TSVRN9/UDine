// Captures from shared/src/umassDining.test.ts (REAL_FRAGMENT) wrapped in foodpro-menu-ajax's response shape.
import 'dart:convert';
import 'dart:io';

const _flows = '../docs/design/explorations/2026-10-ui-overhaul/flows';

const realFragment =
    r'''<a data-healthfulness="30" data-carbon-list="B" data-ingredient-list="FREIHOFFER&#039;S Country White Bread" data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Wheat" data-recipe-webcode="LPR SUS VGT H3 CR2" data-clean-diet-str="Local, Sustainable, Vegetarian" data-serving-size="1 each" data-calories="127" data-calories-from-fat="26" data-total-fat="2.9g" data-total-fat-dv="4" data-sat-fat="0.5g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="50.9mg" data-cholesterol_dv="" data-sodium="237.2mg" data-sodium-dv="10" data-total-carb="20.4g" data-total-carb-dv="16" data-dietary-fiber="1g" data-dietary-fiber-dv="3" data-sugars="3.4g" data-sugars-dv="" data-protein="5.3g" data-protein-dv="9" data-dish-name="French Toast" href="#inline">French Toast</a><a data-healthfulness="30" data-carbon-list="A" data-ingredient-list="Sweet Plantains" data-allergens="Milk, Eggs, Gluten, Soy, Corn  , Sesame , Wheat" data-recipe-webcode="VGT H3 CR1" data-clean-diet-str="Vegetarian" data-serving-size="1 OZ" data-calories="69" data-calories-from-fat="33" data-total-fat="3.7g" data-total-fat-dv="5" data-sat-fat="0.7g" data-sat-fat-dv="" data-trans-fat="0g" data-cholesterol="0mg" data-cholesterol_dv="" data-sodium="123.2mg" data-sodium-dv="5" data-total-carb="8.9g" data-total-carb-dv="7" data-dietary-fiber="0.2g" data-dietary-fiber-dv="1" data-sugars="8.2g" data-sugars-dv="" data-protein="0.3g" data-protein-dv="0" data-dish-name="Fried Plantain" href="#inline">Fried Plantain</a>''';

/// Response body for one hall-day: two periods, so the cache round-trip covers both.
String ajaxBody() => jsonEncode({
  'breakfast': {'Breakfast Entrees': realFragment},
  'late night': {'Mediterranean': realFragment},
});

/// 2026-10-11 capture of get_infov2 (35 locations carry the business_level triple).
List<dynamic> locations() => jsonDecode(File('$_flows/locations-2026-10-11.json').readAsStringSync()) as List;

String eventsBody() => File('$_flows/events-raw.json').readAsStringSync();
