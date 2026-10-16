import 'package:flutter/widgets.dart';
import 'package:sqflite/sqflite.dart';
import '../theme/tokens.dart';

typedef TableDump = ({String name, int count, List<String> rows});

const _newest = 40, _cell = 56;

/// Every table of the device database: its row count and its newest rows (by rowid), one line each. preferences_kv is the exception: every
/// key by name (settings and rankings live there among the caches), with the `occupancy:` caches folded into one count line. Reads only.
Future<({int userVersion, List<TableDump> tables})> dumpStore(Database db) async {
  final version = (await db.rawQuery('PRAGMA user_version')).first.values.first! as int;
  final names = [for (final r in await db.rawQuery("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'android_metadata' ORDER BY name")) r['name']! as String];
  String cell(Object? v) {
    final s = '$v';
    return s.length > _cell ? '${s.substring(0, _cell)}...' : s;
  }
  return (
    userVersion: version,
    tables: [
      for (final n in names)
        (
          name: n,
          count: Sqflite.firstIntValue(await db.rawQuery('SELECT count(*) FROM "$n"'))!,
          rows: n == 'preferences_kv' ? await _prefs(db, cell) : [for (final r in await db.rawQuery('SELECT * FROM "$n" ORDER BY rowid DESC LIMIT $_newest')) r.values.map(cell).join(' | ')],
        ),
    ],
  );
}

Future<List<String>> _prefs(Database db, String Function(Object?) cell) async {
  final rows = await db.rawQuery("SELECT * FROM preferences_kv WHERE key NOT LIKE 'occupancy:%' ORDER BY key");
  final n = Sqflite.firstIntValue(await db.rawQuery("SELECT count(*) FROM preferences_kv WHERE key LIKE 'occupancy:%'"))!;
  return [for (final r in rows) r.values.map(cell).join(' | '), if (n > 0) 'occupancy:*: $n cached'];
}

/// `/debug/store`: the device database as it stands, for the on-device upgrade evidence. Not in release builds (app.dart).
class StorePage extends StatelessWidget {
  const StorePage({super.key, required this.db});
  final Database? db;

  @override
  Widget build(BuildContext context) {
    final style = M2Text.meta.style(M2Color.ink);
    return ColoredBox(
      color: M2Color.chalk,
      child: SafeArea(
        child: DefaultTextStyle(
          style: style,
          child: db == null
              ? const Text('menus only: no store')
              : FutureBuilder(
                  future: dumpStore(db!),
                  builder: (c, s) {
                    final d = s.data;
                    if (d == null) return Text(s.hasError ? '${s.error}' : '');
                    return SingleChildScrollView(
                      padding: const EdgeInsets.all(M2Space.part),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('user_version ${d.userVersion}', style: const TextStyle(fontWeight: FontWeight.bold)),
                        for (final t in d.tables) ...[
                          const SizedBox(height: M2Space.part),
                          Text('${t.name}: ${t.count}', style: const TextStyle(fontWeight: FontWeight.bold)),
                          for (final r in t.rows) Text(r),
                        ],
                      ]),
                    );
                  },
                ),
        ),
      ),
    );
  }
}
