// With tracking off the plate model refuses to record, and leaves the plate in progress exactly as it was for when tracking is back on.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/bowl.dart' show buildOf;
import 'package:udine/core/m2/bowl_builder.dart';
import 'package:udine/core/m2/board.dart' show Macro;
import 'package:udine/shell/plate_model.dart';
import '../core/m2/support.dart';

void main() {
  const mac = Macro(140, 12, 10, 5);

  test('add and step do nothing while tracking is off, and the plate comes back as it was', () {
    var on = true;
    final m = PlateModel(tracking: () => on)..add('lunch', 'Chobani', const {}, mac);
    final id = m.state.plates.single.id, key = m.state.plates.single.items.single.key;
    on = false;
    var heard = 0;
    m.addListener(() => heard++);
    m.add('lunch', 'Banana', const {}, mac);
    m.step(id, key, 1);
    expect(heard, 0);
    expect(m.state.plates.single.items.single.qty, 1);
    expect(m.state.plates.single.items, hasLength(1));
    on = true;
    m.step(id, key, 1);
    expect(m.state.plates.single.items.single.qty, 2);
  });

  test('Log is refused while tracking is off', () async {
    var on = false;
    final m = PlateModel(tracking: () => on, write: (_) async => () async {}, readDay: (_) async => const []);
    on = true;
    m.add('lunch', 'Chobani', const {}, mac);
    on = false;
    expect(m.canLog, isFalse);
    expect(await m.log(), isFalse);
  });

  test('addBowl and updateBowl do nothing while tracking is off, and the plate comes back as it was', () {
    var on = true;
    final ss = board.days[today]!['W']!['lunch']!, si = ss.indexWhere((x) => x.name == 'Noodle Bowl'), di = ss[si].dishes.indexWhere((x) => x.dishName == 'Beef Brisket Noodle Bowl');
    final spec = BowlSpec.build(buildOf(board, today, 'W', 'lunch', si, di)!, place: 'W', meal: 'lunch');
    final egg = spec.parts.indexWhere((x) => x.dishName == 'Hard Boiled Egg');
    final m = PlateModel(tracking: () => on)..addBowl('lunch', spec, bowlNow(spec, {egg: 1}));
    final it = m.state.plates.single.items.single;
    on = false;
    var heard = 0;
    m.addListener(() => heard++);
    m.addBowl('lunch', spec, bowlNow(spec, {egg: 2}));
    m.updateBowl(m.state.plates.single.id, it.key, spec, bowlNow(spec, {egg: 2}));
    expect(heard, 0);
    expect(m.state.plates.single.items.single.key, it.key);
    expect(m.state.plates, hasLength(1));
  });
}
