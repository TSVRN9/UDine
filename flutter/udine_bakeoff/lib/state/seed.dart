import '../logic/fixture.dart';
import '../logic/menu_view.dart';
import '../logic/plate.dart';
import 'store.dart';

const _today = '2026-10-08';

/// Dev entry for goldens and the integration recordings (RN `applyDevParams`):
/// `diet=veg,halal&avoid=Milk,Soy&scores=health,carbon&newton=1&plate=W:lunch:brisket key,key2*2;F:lunch:key*h&logged=1`.
/// A plate is `place:meal:key[*qty]` (`*h` is half), plates are separated by `;`; `logged=N` logs the first N plates and drops the
/// receipt unless `receipt=1`. A key it does not carry leaves the store as it was.
void applySeed(Store s, Fixture fx, String query) {
  final q = {for (final kv in query.split('&').where((x) => x.contains('='))) kv.substring(0, kv.indexOf('=')): kv.substring(kv.indexOf('=') + 1)};
  List<String> list(String k) => (q[k] ?? '').isEmpty ? [] : q[k]!.split(',');
  Prefs? prefs;
  Toggles? show;
  if (q.containsKey('diet') || q.containsKey('avoid')) {
    final d = list('diet');
    prefs = Prefs(veg: d.contains('veg'), plant: d.contains('plant'), halal: d.contains('halal'), avoid: list('avoid'));
  }
  if (q.containsKey('scores')) {
    final c = list('scores');
    show = Toggles(health: c.contains('health'), carbon: c.contains('carbon'));
  }
  PlateState? plates;
  if ((q['plate'] ?? '').isNotEmpty) {
    plates = emptyPlates;
    for (final spec in q['plate']!.split(';')) {
      final parts = spec.split(':'), place = parts[0], meal = parts[1];
      for (final it in parts[2].split(',').where((x) => x.isNotEmpty)) {
        final kq = it.split('*'), d = servingOn(fx, _today, place, meal, dishKey(kq[0]));
        if (d == null) continue;
        plates = addDish(plates!, meal, d.name, {place: d});
        final id = plates.plates[plates.front].id, qty = kq.length > 1 ? kq[1] : '1';
        if (qty == 'h') {
          plates = stepItem(plates, id, d.key, -1);
        } else {
          for (var n = 1; n < (int.tryParse(qty) ?? 1); n++) {
            plates = addDish(plates!, meal, d.name, {place: d});
          }
        }
      }
    }
  }
  s.seed(plates: plates, prefs: prefs, show: show, newton: q.containsKey('newton') ? q['newton'] == '1' : null);
  for (var n = int.tryParse(q['logged'] ?? '') ?? 0; n > 0; n--) {
    s.setFront(0);
    s.logPlate();
  }
  if (!q.containsKey('receipt')) s.dropReceipt();
}
