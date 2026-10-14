import 'dart:io';
import 'package:flutter/services.dart';

/// flutter_test draws every family as Ahem unless a test loads it: M2's two families, from the bundled files.
Future<void> loadFonts() async {
  for (final (family, files) in [
    ('Oswald', ['Oswald_500Medium', 'Oswald_600SemiBold', 'Oswald_700Bold']),
    ('LibreFranklin', ['LibreFranklin_400Regular', 'LibreFranklin_500Medium', 'LibreFranklin_600SemiBold', 'LibreFranklin_700Bold']),
  ]) {
    final l = FontLoader(family);
    for (final f in files) {
      l.addFont(Future.value(ByteData.sublistView(File('assets/fonts/$f.ttf').readAsBytesSync())));
    }
    await l.load();
  }
}
