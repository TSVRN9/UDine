import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:sqflite/sqflite.dart';

import '../../theme/m2_tokens.g.dart';
import '../pdf_cache.dart';
import '../repository.dart';
import '../source.dart';
import '../supabase_source.dart';
import '../packaged.dart';
import 'flags.dart';
import 'recorded_client.dart';
import 'recorded_packaged.dart';

export 'flags.dart';

/// M2's net.slow token (1600 ms).
final defaultSlow = Duration(milliseconds: M2Motion.netSlow.round());

const _bundled = 'assets/recorded/'; // internal flavor only (pubspec.yaml)
Future<String> _fromBundle(String name) => rootBundle.loadString('$_bundled$name');

/// A recording from the app bundle (internal flavor only).
Future<String> recordedAsset(String name) => _fromBundle(name);

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
  Future<String> Function(String name)? read,
  Duration? slow,
  List<String> pins = const [],
  Future<List<int>> Function(String file) readPdf = _pdfFromBundle,
  Directory? pdfDir,
}) async {
  read ??= _fromBundle;
  final client = RecordedClient(
    menus: jsonDecode(await read('menus-2026-10-08-to-22.json')) as Map<String, dynamic>,
    locations: await recordedLocations(read),
    events: f.noEvents ? '{"events":[]}' : await read('events-raw.json'),
    pdf: readPdf,
    busyDelay: f.busyLate ? defaultSlow : null,
  );
  final net = NetClient(client, f.net == NetMode.offline ? NetMode.ok : f.net, slow ?? defaultSlow);
  final at = f.at;
  final repo = Repository(UmassSource(net), db, supabase: SupabaseSource(net), now: at == null ? null : () => at, pdfs: PdfCache(pdfDir ?? Directory.systemTemp.createTempSync('udine-pdf'), net));
  if (f.net == NetMode.offline) {
    await repo.launch(pins: pins);
    await repo.savePdfs(f.savedPdfs);
    await repo.saveCafes(f.savedCafes);
    net.mode = NetMode.offline;
  }
  return repo;
}

/// The packaged groups' sources over M2's recordings (`RecordedPackagedClient`): the network flag does not reach them, as in M2, where
/// Packaged and Search UMass Dining are asked for whenever Search is online.
Future<({PackagedSource packaged, LookupDishSource lookup})> recordedPackaged(RecordedFlags f, {Future<String> Function(String name)? read, http.Client Function(http.Client inner)? wrap}) async {
  read ??= _fromBundle;
  final http.Client client = (wrap ?? (c) => c)(RecordedPackagedClient(
    flow: jsonDecode(await read('packaged-2026-10-13.json')) as Map<String, dynamic>,
    menus: jsonDecode(await read('menus-2026-10-08-to-22.json')) as Map<String, dynamic>,
    lookup: f.lookup,
    packFail: f.packFail,
  ));
  return (packaged: PackagedSource(client), lookup: LookupDishSource(client, now: () => f.at ?? DateTime.now()));
}
