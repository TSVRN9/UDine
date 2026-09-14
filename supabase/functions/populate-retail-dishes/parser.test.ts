// Red-first tests for populate-retail-dishes' three parsers + cookie-header helper, against REAL
// captured markup (trimmed) from af-foodpro1.campus.ads.umass.edu, verified live 2026-09-14 -- see
// docs/apk-reverse-engineering.md's "FoodPro Web INA" section and this function's own header
// comment. label.aspx fixtures are from two DIFFERENT retail locations (Bluewall Grill and Harvest)
// so the parser isn't validated against one page's quirks alone.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/populate-retail-dishes/parser.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { parseRetailLocations, parseLongMenuDishes, parseLabelNutrition, parseLabelAllergens, cookieHeaderFromSetCookie } = await import("./index.ts");

// Trimmed from a real location.aspx response: the 4 residential halls (01-04, must be excluded)
// plus 3 real retail/café rows (08, 14, 23).
const LOCATION_FRAGMENT = `
            <tr><td><span class='locationchoices'><a href='shortmenu.aspx?sName=%60&locationNum=01&locationName=Worcester+Dining+Commons&naFlag=1'>Worcester Dining Commons</a></span></td></tr>
            <tr><td><span class='locationchoices'><a href='shortmenu.aspx?sName=%60&locationNum=02&locationName=Franklin+Dining+Commons&naFlag=1'>Franklin Dining Commons</a></span></td></tr>
            <tr><td><span class='locationchoices'><a href='shortmenu.aspx?sName=%60&locationNum=03&locationName=Hampshire+Dining+Commons&naFlag=1'>Hampshire Dining Commons</a></span></td></tr>
            <tr><td><span class='locationchoices'><a href='shortmenu.aspx?sName=%60&locationNum=04&locationName=+Berkshire+Dining+Commons&naFlag=1'> Berkshire Dining Commons</a></span></td></tr>
            <tr><td><span class='locationchoices'><a href='shortmenu.aspx?sName=%60&locationNum=08&locationName=Whitmore+Cafe&naFlag=1'>Whitmore Cafe</a></span></td></tr>
            <tr><td><span class='locationchoices'><a href='shortmenu.aspx?sName=%60&locationNum=14&locationName=Bluewall+-+Grill&naFlag=1'>Bluewall - Grill</a></span></td></tr>
            <tr><td><span class='locationchoices'><a href='shortmenu.aspx?sName=%60&locationNum=23&locationName=Harvest&naFlag=1'>Harvest</a></span></td></tr>
`;

Deno.test("parseRetailLocations excludes the 4 residential halls and keeps every retail/café row", () => {
  const rows = parseRetailLocations(LOCATION_FRAGMENT);
  if (rows.length !== 3) throw new Error(`expected 3 retail locations, got ${rows.length}: ${JSON.stringify(rows)}`);
  if (rows.some((r) => [1, 2, 3, 4].includes(r.locationNum))) throw new Error("a residential hall leaked through");

  const bluewall = rows.find((r) => r.locationNum === 14);
  if (!bluewall) throw new Error("Bluewall Grill (14) missing");
  if (bluewall.locationNumRaw !== "14") throw new Error(`expected locationNumRaw "14", got ${bluewall.locationNumRaw}`);
  if (bluewall.hrefLocationName !== "Bluewall+-+Grill") throw new Error(`expected hrefLocationName "Bluewall+-+Grill", got ${bluewall.hrefLocationName}`);
  if (bluewall.displayName !== "Bluewall - Grill") throw new Error(`expected displayName "Bluewall - Grill", got ${bluewall.displayName}`);
});

Deno.test("parseRetailLocations returns an empty array when nothing matches (signals a real crawl failure upstream)", () => {
  const rows = parseRetailLocations("<html><body>no locations here</body></html>");
  if (rows.length !== 0) throw new Error(`expected 0 rows, got ${rows.length}`);
});

// Real longmenu.aspx row for Bluewall Grill (locationNum=14), mealName=Lunch, captured live
// 2026-09-14 -- a locationchoices-shaped page fragment for one dish row plus a second real row.
const LONGMENU_FRAGMENT = `
<td><div class='longmenucoldispname'><INPUT TYPE=CHECKBOX NAME=recipe VALUE='060125*1*12' onClick='fillQty(3);'><a href='label.aspx?locationNum=14&locationName=Bluewall+-+Grill&dtdate=09%2f14%2f2026&RecNumAndPort=060125*1' target=_top onMouseOver="window.status = 'Click for label of this item.'; return true;" onMouseOut="window.status= ' ';">Cheeseburger</a></div></td>
<td><div class='longmenucoldispname'><INPUT TYPE=CHECKBOX NAME=recipe VALUE='071417*1*12' onClick='fillQty(4);'><a href='label.aspx?locationNum=14&locationName=Bluewall+-+Grill&dtdate=09%2f14%2f2026&RecNumAndPort=071417*1' target=_top onMouseOver="window.status = 'Click for label of this item.'; return true;" onMouseOut="window.status= ' ';">Chicken Tenders & Fries Basket</a></div></td>
`;

Deno.test("parseLongMenuDishes extracts dish name + label.aspx path for every longmenucoldispname row", () => {
  const rows = parseLongMenuDishes(LONGMENU_FRAGMENT);
  if (rows.length !== 2) throw new Error(`expected 2 rows, got ${rows.length}`);
  if (rows[0].dishName !== "Cheeseburger") throw new Error(`expected Cheeseburger, got ${rows[0].dishName}`);
  if (rows[0].labelPath !== "label.aspx?locationNum=14&locationName=Bluewall+-+Grill&dtdate=09%2f14%2f2026&RecNumAndPort=060125*1") {
    throw new Error(`unexpected labelPath: ${rows[0].labelPath}`);
  }
  if (rows[1].dishName !== "Chicken Tenders & Fries Basket") throw new Error(`expected 'Chicken Tenders & Fries Basket', got ${rows[1].dishName}`);
});

Deno.test("parseLongMenuDishes returns an empty array for a location/meal period with nothing served (not an error)", () => {
  const rows = parseLongMenuDishes("<html><body>no dishes today</body></html>");
  if (rows.length !== 0) throw new Error(`expected 0 rows, got ${rows.length}`);
});

// Real label.aspx response for Bluewall Grill's Cheeseburger (RecNumAndPort=060125*1), captured
// live 2026-09-14 and verified against the actual af-foodpro1 response (calories 348, total fat
// 17.9g, protein 23.7g, etc.) -- trimmed (long INGREDIENTS text shortened) but structurally intact.
const CHEESEBURGER_LABEL = `
<!-- The following is required by Aurora Information Systems, DO NOT MODIFY OR REMOVE -->
   <!-- fieldfilt.aspx, Version 2.6.0  -->
<!-- End of Aurora Information Systems Required Text -->
<html>
<head>
<title>Nutrition Label</title>
<link rel="stylesheet" href="foodpro_web_ina.css" type="text/css">
</head>
<body class="labelbody">
<div class="labelrecipe">Cheeseburger</div>
<br>

<table border="1" bordercolor=#000000 align="center" width=95% cellpadding="4" cellspacing="0" bgcolor=#FFFFFF>
  <tr>
    <td>
      <table border="0" bordercolorlight=#000000 bordercolordark=#000000 width=100% height=100% align="center" valign="top" cellpadding="0" cellspacing="0">
        <span class="labelingredientscaption">INGREDIENTS:&nbsp;&nbsp;</span><span class="labelingredientsvalue">Halal Grass Fed Burger Patty (trimmed for test fixture)</span>
          <td rowspan=10 valign="top" width=32%>
            <font size="7" face="arial"><b>Nutrition Facts</b></font><br>
              <font size="5" face="arial">Serving Size&nbsp;</font><font size="5" face="arial">1 each</font><br>
              <font size="5" face="arial"><b>Calories&nbsp;348</b></font><br>
              <font size="5" face="arial">&nbsp;&nbsp;&nbsp;&nbsp;Calories from Fat&nbsp;2</font><br><br>
              <font size="3" face="arial">*Percent Daily Values (DV)<br>
            &nbsp;are based on a 2,000<br>&nbsp;calorie diet.</font>
          </td>
        </tr>
        <tr>
          <td>
              <font size="4" face="arial"><b>Total Fat&nbsp;</b></font><font face="arial" size="4">17.9g</font></font>
            <hr size="2" noshade color=#000000>
          </td>
          <td>
              <font size="4" face="arial"><b>Tot. Carb.&nbsp;</b></font><font size="4" face="arial">23.9g</font>
            <hr size="2" noshade color=#000000>
          </td>
        </tr>
        <tr>
          <td>
              <font size="4" face="arial">&nbsp;&nbsp;Sat. Fat&nbsp;</font><font size="4" face="arial">7.7g</font>
          </td>
          <td>
              <font size="4" face="arial">&nbsp;&nbsp;Dietary Fiber&nbsp;</font><font size="4" face="arial">2.3g</font>
          </td>
        </tr>
        <tr>
          <td colspan="1">
              <font size="4" face="arial">&nbsp;&nbsp;Trans Fat&nbsp;</font><font size="4" face="arial">0.6g</font>
          </td>
          <td colspan="1">
              <font size="4" face="arial">&nbsp;&nbsp;Sugars&nbsp;</font><font size="4" face="arial">5.6g</font>
          </td>
        </tr>
        <tr>
          <td>
              <font size="4" face="arial"><b>Cholesterol&nbsp;</b></font><font size="4" face="arial">64.1mg</font>
          </td>
          <td colspan="1">
              <font size="4" face="arial"><b>Protein&nbsp;</b></font><font size="4" face="arial">23.7g</font>
          </td>
        </tr>
        <tr>
          <td>
              <font size="4" face="arial"><b>Sodium&nbsp;</b></font><font size="4" face="arial">510.3mg</font>
          </td>
        </tr>
  <table border="0" cellpadding="1" cellspacing="1" align="center" width=95%>
    <tr>
      <td>
        <span class="labelallergenscaption">ALLERGENS:&nbsp;&nbsp;</span><span class="labelallergensvalue">Milk, Gluten, Soy, Corn, Sesame, Wheat</span>
      </td>
    </tr>
  </table>
</table>
</body>
</html>
`;

Deno.test("parseLabelNutrition extracts every field correctly from a real label.aspx page (Bluewall Grill Cheeseburger)", () => {
  const n = parseLabelNutrition(CHEESEBURGER_LABEL);
  if (!n) throw new Error("expected nutrition, got null");
  if (n.servingSize !== "1 each") throw new Error(`servingSize: expected "1 each", got ${n.servingSize}`);
  if (n.calories !== 348) throw new Error(`calories: expected 348, got ${n.calories}`);
  if (n.caloriesFromFat !== 2) throw new Error(`caloriesFromFat: expected 2, got ${n.caloriesFromFat}`);
  if (n.totalFatG !== 17.9) throw new Error(`totalFatG: expected 17.9, got ${n.totalFatG}`);
  if (n.satFatG !== 7.7) throw new Error(`satFatG: expected 7.7, got ${n.satFatG}`);
  if (n.transFatG !== 0.6) throw new Error(`transFatG: expected 0.6, got ${n.transFatG}`);
  if (n.cholesterolMg !== 64.1) throw new Error(`cholesterolMg: expected 64.1, got ${n.cholesterolMg}`);
  if (n.sodiumMg !== 510.3) throw new Error(`sodiumMg: expected 510.3, got ${n.sodiumMg}`);
  if (n.totalCarbG !== 23.9) throw new Error(`totalCarbG: expected 23.9, got ${n.totalCarbG}`);
  if (n.dietaryFiberG !== 2.3) throw new Error(`dietaryFiberG: expected 2.3, got ${n.dietaryFiberG}`);
  if (n.sugarsG !== 5.6) throw new Error(`sugarsG: expected 5.6, got ${n.sugarsG}`);
  if (n.proteinG !== 23.7) throw new Error(`proteinG: expected 23.7, got ${n.proteinG}`);
});

Deno.test("parseLabelAllergens extracts the comma-split allergen list (Bluewall Grill Cheeseburger)", () => {
  const allergens = parseLabelAllergens(CHEESEBURGER_LABEL);
  if (JSON.stringify(allergens) !== JSON.stringify(["Milk", "Gluten", "Soy", "Corn", "Sesame", "Wheat"])) {
    throw new Error(`unexpected allergens: ${JSON.stringify(allergens)}`);
  }
});

// Real label.aspx response for Harvest's African Soul Rice Salad (RecNumAndPort=184625*4) --
// a DIFFERENT retail location than the Cheeseburger fixture above, captured/verified live
// 2026-09-14, so the parser is checked against more than one page's quirks.
const RICE_SALAD_LABEL = `
<html>
<body class="labelbody">
<div class="labelrecipe">African Soul Rice Salad</div>
<table>
              <font size="5" face="arial">Serving Size&nbsp;</font><font size="5" face="arial">4 oz</font><br>
              <font size="5" face="arial"><b>Calories&nbsp;172</b></font><br>
              <font size="5" face="arial">&nbsp;&nbsp;&nbsp;&nbsp;Calories from Fat&nbsp;1.2</font><br><br>
              <font size="4" face="arial"><b>Total Fat&nbsp;</b></font><font face="arial" size="4">6.2g</font></font>
              <font size="4" face="arial"><b>Tot. Carb.&nbsp;</b></font><font size="4" face="arial">25.2g</font>
              <font size="4" face="arial">&nbsp;&nbsp;Sat. Fat&nbsp;</font><font size="4" face="arial">0.5g</font>
              <font size="4" face="arial">&nbsp;&nbsp;Dietary Fiber&nbsp;</font><font size="4" face="arial">1.8g</font>
              <font size="4" face="arial">&nbsp;&nbsp;Trans Fat&nbsp;</font><font size="4" face="arial">0g</font>
              <font size="4" face="arial">&nbsp;&nbsp;Sugars&nbsp;</font><font size="4" face="arial">1.9g</font>
              <font size="4" face="arial"><b>Cholesterol&nbsp;</b></font><font size="4" face="arial">0mg</font>
              <font size="4" face="arial"><b>Protein&nbsp;</b></font><font size="4" face="arial">3.4g</font>
              <font size="4" face="arial"><b>Sodium&nbsp;</b></font><font size="4" face="arial">155.1mg</font>
        <span class="labelallergenscaption">ALLERGENS:&nbsp;&nbsp;</span><span class="labelallergensvalue">Gluten, Soy, Wheat</span>
</table>
</body>
</html>
`;

Deno.test("parseLabelNutrition extracts every field correctly from a SECOND retail location's real label.aspx page (Harvest)", () => {
  const n = parseLabelNutrition(RICE_SALAD_LABEL);
  if (!n) throw new Error("expected nutrition, got null");
  if (n.servingSize !== "4 oz") throw new Error(`servingSize: expected "4 oz", got ${n.servingSize}`);
  if (n.calories !== 172) throw new Error(`calories: expected 172, got ${n.calories}`);
  if (n.caloriesFromFat !== 1.2) throw new Error(`caloriesFromFat: expected 1.2, got ${n.caloriesFromFat}`);
  if (n.totalFatG !== 6.2) throw new Error(`totalFatG: expected 6.2, got ${n.totalFatG}`);
  if (n.proteinG !== 3.4) throw new Error(`proteinG: expected 3.4, got ${n.proteinG}`);
  if (n.sodiumMg !== 155.1) throw new Error(`sodiumMg: expected 155.1, got ${n.sodiumMg}`);

  const allergens = parseLabelAllergens(RICE_SALAD_LABEL);
  if (JSON.stringify(allergens) !== JSON.stringify(["Gluten", "Soy", "Wheat"])) {
    throw new Error(`unexpected allergens: ${JSON.stringify(allergens)}`);
  }
});

Deno.test("parseLabelNutrition returns null for a page with no Calories figure (stale/expired RecNum) instead of throwing", () => {
  const n = parseLabelNutrition("<html><body>Recipe not found</body></html>");
  if (n !== null) throw new Error(`expected null, got ${JSON.stringify(n)}`);
});

Deno.test("parseLabelAllergens returns an empty array when the page has no allergens span", () => {
  const allergens = parseLabelAllergens("<html><body>no allergens here</body></html>");
  if (allergens.length !== 0) throw new Error(`expected 0 allergens, got ${JSON.stringify(allergens)}`);
});

Deno.test("cookieHeaderFromSetCookie reduces Set-Cookie values to a single Cookie header, dropping attributes", () => {
  const header = cookieHeaderFromSetCookie(["SavedAllergens=; path=/; HttpOnly", "WebInaCartLocation=; path=/; HttpOnly"]);
  if (header !== "SavedAllergens=; WebInaCartLocation=") throw new Error(`unexpected cookie header: ${header}`);
});

Deno.test("cookieHeaderFromSetCookie returns an empty string for no cookies", () => {
  if (cookieHeaderFromSetCookie([]) !== "") throw new Error("expected empty string");
});
