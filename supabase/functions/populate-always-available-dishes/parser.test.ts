// Red-first tests for this function's parsers, against REAL markup captured live 2026-09-14 from
// af-foodpro1.campus.ads.umass.edu's longmenu.aspx and label.aspx for Worcester (locationNum=01,
// the residential hall this function crawls, NOT a retail/café location) -- same source and same
// parsing logic as populate-retail-dishes/index.ts (Deno can't share code across independently-
// deployed functions, see that file's own header comment), re-verified here against a hall page
// rather than assumed identical.
//
// Run: deno test --node-modules-dir=none --allow-env supabase/functions/populate-always-available-dishes/parser.test.ts
(Deno as unknown as { serve: unknown }).serve = () => ({}) as ReturnType<typeof Deno.serve>;

const { parseLongMenuDishes, parseLabelNutrition, parseLabelAllergens, cookieHeaderFromSetCookie } = await import("./index.ts");

// Real longmenu.aspx rows for Worcester's (locationNum=01) Salad Bar/Dressings station,
// mealName=Lunch, captured live 2026-09-14.
const LONGMENU_FRAGMENT = `
<td><div class='longmenucolmenucat'>-- Salad Bar/Dressings --</div></td>
<td><div class='longmenucoldispname'><INPUT TYPE=CHECKBOX NAME=recipe VALUE='153001*1*20' onClick='fillQty(16);'><a href='label.aspx?locationNum=01&locationName=Worcester+Dining+Commons&dtdate=09%2f14%2f2026&RecNumAndPort=153001*1' target=_top onMouseOver="window.status = 'Click for label of this item.'; return true;" onMouseOut="window.status= ' ';">American Cheese</a></div></td>
<td><div class='longmenucoldispname'><INPUT TYPE=CHECKBOX NAME=recipe VALUE='345001*2 1/2*20' onClick='fillQty(17);'><a href='label.aspx?locationNum=01&locationName=Worcester+Dining+Commons&dtdate=09%2f14%2f2026&RecNumAndPort=345001*2+1%2f2' target=_top onMouseOver="window.status = 'Click for label of this item.'; return true;" onMouseOut="window.status= ' ';">Broccoli Flowerettes</a></div></td>
`;

Deno.test("parseLongMenuDishes extracts dish name + label.aspx path for a residential hall's station rows (Worcester Salad Bar)", () => {
  const rows = parseLongMenuDishes(LONGMENU_FRAGMENT);
  if (rows.length !== 2) throw new Error(`expected 2 rows, got ${rows.length}`);
  if (rows[0].dishName !== "American Cheese") throw new Error(`expected American Cheese, got ${rows[0].dishName}`);
  if (rows[0].labelPath !== "label.aspx?locationNum=01&locationName=Worcester+Dining+Commons&dtdate=09%2f14%2f2026&RecNumAndPort=153001*1") {
    throw new Error(`unexpected labelPath: ${rows[0].labelPath}`);
  }
  if (rows[1].dishName !== "Broccoli Flowerettes") throw new Error(`expected Broccoli Flowerettes, got ${rows[1].dishName}`);
});

Deno.test("parseLongMenuDishes returns an empty array for a hall/meal period with nothing served (not an error)", () => {
  const rows = parseLongMenuDishes("<html><body>no dishes today</body></html>");
  if (rows.length !== 0) throw new Error(`expected 0 rows, got ${rows.length}`);
});

// Real label.aspx response for Worcester's American Cheese (RecNumAndPort=153001*1), captured/
// verified live 2026-09-14 (calories 91, total fat 8.1g, protein 5.1g, allergens: Milk) -- trimmed
// but structurally intact, same shape populate-retail-dishes/parser.test.ts's fixtures already
// proved this markup family parses correctly for two DIFFERENT (retail) locations; this is a THIRD,
// a residential hall, confirming the shared markup family really is shared.
const AMERICAN_CHEESE_LABEL = `
<html>
<body class="labelbody">
<div class="labelrecipe">American Cheese</div>
<table border="1" bordercolor=#000000 align="center" width=95% cellpadding="4" cellspacing="0" bgcolor=#FFFFFF>
  <tr>
    <td>
      <table border="0" width=100% height=100% align="center" valign="top" cellpadding="0" cellspacing="0">
        <tr>
          <td rowspan=10 valign="top" width=32%>
            <font size="7" face="arial"><b>Nutrition Facts</b></font><br>
              <font size="5" face="arial">Serving Size&nbsp;</font><font size="5" face="arial">1 OZ</font><br>
              <font size="5" face="arial"><b>Calories&nbsp;91</b></font><br>
              <font size="5" face="arial">&nbsp;&nbsp;&nbsp;&nbsp;Calories from Fat&nbsp;0</font><br><br>
          </td>
        </tr>
        <tr>
          <td>
              <font size="4" face="arial"><b>Total Fat&nbsp;</b></font><font face="arial" size="4">8.1g</font></font>
          </td>
          <td>
              <font size="4" face="arial"><b>Tot. Carb.&nbsp;</b></font><font size="4" face="arial">1g</font>
          </td>
        </tr>
        <tr>
          <td>
              <font size="4" face="arial">&nbsp;&nbsp;Sat. Fat&nbsp;</font><font size="4" face="arial">5.1g</font>
          </td>
          <td>
              <font size="4" face="arial">&nbsp;&nbsp;Dietary Fiber&nbsp;</font><font size="4" face="arial">0g</font>
          </td>
        </tr>
        <tr>
          <td>
              <font size="4" face="arial">&nbsp;&nbsp;Trans Fat&nbsp;</font><font size="4" face="arial">0g</font>
          </td>
          <td>
              <font size="4" face="arial">&nbsp;&nbsp;Sugars&nbsp;</font><font size="4" face="arial">1g</font>
          </td>
        </tr>
        <tr>
          <td>
              <font size="4" face="arial"><b>Cholesterol&nbsp;</b></font><font size="4" face="arial">25.3mg</font>
          </td>
          <td>
              <font size="4" face="arial"><b>Protein&nbsp;</b></font><font size="4" face="arial">5.1g</font>
          </td>
        </tr>
        <tr>
          <td>
              <font size="4" face="arial"><b>Sodium&nbsp;</b></font><font size="4" face="arial">506.3mg</font>
          </td>
        </tr>
  <table border="0" cellpadding="1" cellspacing="1" align="center" width=95%>
    <tr>
      <td>
        <span class="labelallergenscaption">ALLERGENS:&nbsp;&nbsp;</span><span class="labelallergensvalue">Milk</span>
      </td>
    </tr>
  </table>
</table>
</body>
</html>
`;

Deno.test("parseLabelNutrition extracts every field correctly from a real residential-hall label.aspx page (Worcester American Cheese)", () => {
  const n = parseLabelNutrition(AMERICAN_CHEESE_LABEL);
  if (!n) throw new Error("expected nutrition, got null");
  if (n.servingSize !== "1 OZ") throw new Error(`servingSize: expected "1 OZ", got ${n.servingSize}`);
  if (n.calories !== 91) throw new Error(`calories: expected 91, got ${n.calories}`);
  if (n.caloriesFromFat !== 0) throw new Error(`caloriesFromFat: expected 0, got ${n.caloriesFromFat}`);
  if (n.totalFatG !== 8.1) throw new Error(`totalFatG: expected 8.1, got ${n.totalFatG}`);
  if (n.satFatG !== 5.1) throw new Error(`satFatG: expected 5.1, got ${n.satFatG}`);
  if (n.transFatG !== 0) throw new Error(`transFatG: expected 0, got ${n.transFatG}`);
  if (n.cholesterolMg !== 25.3) throw new Error(`cholesterolMg: expected 25.3, got ${n.cholesterolMg}`);
  if (n.sodiumMg !== 506.3) throw new Error(`sodiumMg: expected 506.3, got ${n.sodiumMg}`);
  if (n.totalCarbG !== 1) throw new Error(`totalCarbG: expected 1, got ${n.totalCarbG}`);
  if (n.dietaryFiberG !== 0) throw new Error(`dietaryFiberG: expected 0, got ${n.dietaryFiberG}`);
  if (n.sugarsG !== 1) throw new Error(`sugarsG: expected 1, got ${n.sugarsG}`);
  if (n.proteinG !== 5.1) throw new Error(`proteinG: expected 5.1, got ${n.proteinG}`);
});

Deno.test("parseLabelAllergens extracts a single-allergen list (Worcester American Cheese: Milk)", () => {
  const allergens = parseLabelAllergens(AMERICAN_CHEESE_LABEL);
  if (JSON.stringify(allergens) !== JSON.stringify(["Milk"])) throw new Error(`unexpected allergens: ${JSON.stringify(allergens)}`);
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
