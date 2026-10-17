// Export's temp files: the plaintext log and ranking are cleared at the start of each export and at app start, never straight after the
// share sheet returns (the receiving app may still be reading).
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:udine/boot.dart';
import 'package:udine/shell/share.dart';

void main() {
  late Directory tmp;
  setUp(() => tmp = Directory('${Platform.environment['HOME']}/.cache/udine-scratch/share-${DateTime.now().microsecondsSinceEpoch}')..createSync(recursive: true));
  tearDown(() => tmp.deleteSync(recursive: true));
  Future<Directory> dir() async => tmp;
  File old() => File('${tmp.path}/export/udine-export.json');

  void leave() {
    old().createSync(recursive: true);
    old().writeAsStringSync('[{"an":"old export"}]');
  }

  test('an export clears what the last one left, then writes its own and leaves them for the receiving app', () async {
    leave();
    late List<String> sent;
    await shareFiles({'udine-export.csv': 'a,b', 'udine-favorites.csv': 'c'}, tmp: dir, send: (f) async => sent = [for (final x in f) x.path]);
    expect(old().existsSync(), isFalse);
    expect(sent.map((p) => p.split('/').last), ['udine-export.csv', 'udine-favorites.csv']);
    expect(File(sent.first).readAsStringSync(), 'a,b');
    expect(sent.every((p) => File(p).existsSync()), isTrue, reason: 'still there once the share sheet has returned');
  });

  test('clearExports removes the export directory, and is quiet when there is none', () async {
    await clearExports(tmp: dir);
    leave();
    await clearExports(tmp: dir);
    expect(Directory('${tmp.path}/export').existsSync(), isFalse);
  });

  testWidgets('the app clears old exports as it starts', (t) async {
    leave();
    await t.runAsync(() async {
      sqfliteFfiInit();
      databaseFactory = databaseFactoryFfi;
      // (the recorded assets are not bundled in a test, so the open itself fails after the clear it begins with)
      await Boot.open('/you?data=recorded&at=2026-10-08T12:41', tmp: dir).then<void>((_) {}, onError: (Object _) {});
    });
    expect(old().existsSync(), isFalse);
  });
}
