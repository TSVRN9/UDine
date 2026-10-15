// `/plate?seed=benchmark` (a screenshot route): M2's benchmark plate, Beef Brisket Noodle Bowl x1 and Golden BBQ Chicken Thigh x2, at
// Worcester lunch, put on the in-memory plate the way Search would add it.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/plate.dart';
import '../screens/support.dart';

void main() {
  testWidgets('the benchmark seed is 404 cal / 38.9 g, brisket x1 and the thigh x2, narrowed to Worcester', (t) async {
    final boot = await bootRecorded(t);
    await t.runAsync(() => boot.seedPlate('/plate?seed=benchmark'));
    final p = boot.plate.state.plates.single;
    expect(p.items.map((i) => [i.name, i.qty]), [['Beef Brisket Noodle Bowl', 1], ['Golden BBQ Chicken Thigh', 2]]);
    expect(plateHalls(p), ['W']);
    final tot = totals(p);
    expect([tot.cal, double.parse(tot.p.toStringAsFixed(1))], [404, 38.9]);
  });

  testWidgets('any other route seeds nothing', (t) async {
    final boot = await bootRecorded(t);
    await t.runAsync(() => boot.seedPlate('/halls'));
    expect(boot.plate.state.plates, isEmpty);
  });
}
