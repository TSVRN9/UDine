import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;
import 'package:sqflite/sqflite.dart';

import '../../theme/m2_tokens.g.dart';
import '../pdf_cache.dart';
import '../repository.dart';
import '../source.dart';
import '../supabase_source.dart';
import 'flags.dart';
import 'recorded_client.dart';

export 'flags.dart';

/// M2's net.slow token (1600 ms).
final defaultSlow = Duration(milliseconds: M2Motion.netSlow.round());

const _bundled = 'assets/recorded/'; // internal flavor only (pubspec.yaml)
Future<String> _fromBundle(String name) => rootBundle.loadString('$_bundled$name');

/// The café PDFs UMass publishes are never committed: tool/link_pdfs.sh fills assets/recorded/pdf/ (gitignored) and the internal flavor bundles it.
Future<List<int>> _pdfFromBundle(String file) async => (await rootBundle.load('${_bundled}pdf/$file')).buffer.asUint8List();

/// get_infov2 as M2 reads it: hours and statuses from the Oct 8 capture (M2's NOW is Thursday Oct 8), and the street address and
/// `map_address` and `short_description_v2` from the Oct 11 one (NOTES "Round 9", "Where"), which Oct 8 lacks. Busy is simulated over the halls (RecordedClient).
Future<String> recordedLocations(Future<String> Function(String name) read) async {
  final hours = (jsonDecode(await read('locations-2026-10-08.json')) as List).cast<Map<String, dynamic>>();
  final where = {for (final l in (jsonDecode(await read('locations-2026-10-11.json')) as List).cast<Map<String, dynamic>>()) l['location_title']: l};
  for (final l in hours) {
    final w = where[l['location_title']];
    if (w != null) {
      l['address'] = w['address'];
      l['map_address'] = w['map_address'];
      l['short_description_v2'] = w['short_description_v2'];
      // Oct 8 has a PDF café's menu links as bare text; Oct 11 has the links
      for (final k in const ['breakfast_menu', 'lunch_menu', 'dinner_menu']) {
        if ('${w[k]}'.contains('.pdf')) l[k] = w[k];
      }
    }
  }
  return jsonEncode(hours);
}

/// The same Repository the live app uses, with M2's recordings behind the HTTP seam and [RecordedFlags] applied:
/// `at` replaces the clock, `net` the network. Offline first warms the cache once online (the repository's own launch),
/// then drops the network, so today and tomorrow are saved and every other day is not.
/// [read] loads a recording by file name (the bundled asset by default). [slow] overrides the slow delay for tests. [pins] are the pinned cafés
/// whose PDFs offline warms; [readPdf] loads a recorded PDF, which is kept (throwaway, like the store) in [pdfDir] or a temp folder.
Future<Repository> recordedRepository(RecordedFlags f, Database db, {
  Future<String> Function(String name) read = _fromBundle,
  Duration? slow,
  List<String> pins = const [],
  Future<List<int>> Function(String file) readPdf = _pdfFromBundle,
  Directory? pdfDir,
}) async {
  final client = RecordedClient(
    menus: jsonDecode(await read('menus-2026-10-08-to-22.json')) as Map<String, dynamic>,
    locations: await recordedLocations(read),
    events: f.noEvents ? '{"events":[]}' : await read('events-raw.json'),
    pdf: readPdf,
  );
  final net = NetClient(client, f.net == NetMode.offline ? NetMode.ok : f.net, slow ?? defaultSlow);
  final at = f.at;
  final repo = Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: at == null ? null : () => at, pdfs: PdfCache(pdfDir ?? Directory.systemTemp.createTempSync('udine-pdf'), net));
  if (f.net == NetMode.offline) {
    await repo.launch(pins: pins);
    await repo.savePdfs(f.savedPdfs);
    net.mode = NetMode.offline;
  }
  return repo;
}
