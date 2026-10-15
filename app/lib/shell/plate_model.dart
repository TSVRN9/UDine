import 'package:flutter/foundation.dart';

import '../core/m2/board.dart';
import '../core/m2/plate.dart';

/// The plates being built, held in memory until Log (as RN's): nothing here is saved, so a restart is an empty plate.
class PlateModel extends ChangeNotifier {
  PlateState _s = emptyPlates;
  PlateState get state => _s;

  void add(String meal, String name, Map<String, MenuItem> refs) {
    _s = addDish(_s, meal, name, refs);
    notifyListeners();
  }

  void step(int plateId, String key, int dir) {
    _s = stepItem(_s, plateId, key, dir);
    notifyListeners();
  }

  void setFront(int i) {
    if (i == _s.front || i < 0 || i >= _s.plates.length) return;
    _s = PlateState(_s.plates, i, _s.nextId);
    notifyListeners();
  }
}
