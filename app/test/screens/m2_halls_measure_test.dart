// M2's own Halls geometry (m2_dom.json, `halls` per width, measured with ~/.cache/udine-scratch/flutter/m2dom.js on src.html at dpr 1)
// against ours, within 1 dp. Keys, each [left, top, width, height] unless a list: hhead, date, h1, netl, tryagain; bands, nm, st, bz (x4);
// pins, pinNm, pinSt (x5 with ?pins=5); sec (the "Cafés & markets" h2), areas, areaA, areaB (x4). The data is not in m2_dom.json yet, so
// this skips and says which keys are missing.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/ui/ui.dart';
import '../fonts.dart';
import 'support.dart';

final _dom = jsonDecode(File('test/m2_dom.json').readAsStringSync()) as Map<String, dynamic>;
const _need = ['hhead', 'date', 'h1', 'bands', 'nm', 'st', 'bz', 'pins', 'pinNm', 'pinSt', 'sec', 'areas', 'areaA', 'areaB'];

void main() {
  setUpAll(loadFonts);
  for (final w in [360, 390]) {
    final halls = (_dom['$w'] as Map<String, dynamic>)['halls'] as Map<String, dynamic>?;
    final missing = [for (final k in _need) if (halls?[k] == null) k];
    // ignore: avoid_print
    if (missing.isNotEmpty) print('skipped: m2_dom.json has no halls.${missing.join(', halls.')} at $w');
    testWidgets('Halls at $w dp matches M2\'s DOM within 1 dp', skip: missing.isNotEmpty, (t) async {
      await openApp(t, await bootRecorded(t, pins: ['Wasabi', 'Tamales', "Peet's Coffee & Tea", 'Harvest Market', 'Courtside Café']), w: w.toDouble());
      await until(t, () => find.byType(Meter).evaluate().isNotEmpty);
      await t.pumpAndSettle();
      List<double> r(Finder f) {
        final x = t.getRect(f);
        return [x.left, x.top, x.width, x.height];
      }

      void near(String what, List<double> got, Object? want) {
        final m = (want as List).cast<num>();
        for (var i = 0; i < 4; i++) {
          expect(got[i], closeTo(m[i], 1.0), reason: '$what[${const ['left', 'top', 'width', 'height'][i]}] ours $got, M2 $m');
        }
      }

      final bands = find.byType(Band);
      near('hhead', r(find.byType(ScreenHeader).first), halls!['hhead']);
      near('date', r(find.text('Thursday, October 8').first), halls['date']);
      near('h1', r(find.text('Lunch')), halls['h1']);
      for (var i = 0; i < 4; i++) {
        near('band $i', r(bands.at(i)), (halls['bands'] as List)[i]);
      }
      for (var i = 0; i < 5; i++) {
        near('pin $i', r(bands.at(4 + i)), (halls['pins'] as List)[i]);
      }
      near('sec', r(find.text('Cafés & markets')), halls['sec']);
      final rows = find.byType(LRow);
      for (var i = 0; i < 4; i++) {
        near('area $i', r(rows.at(i)), (halls['areas'] as List)[i]);
      }
    });
  }
}
