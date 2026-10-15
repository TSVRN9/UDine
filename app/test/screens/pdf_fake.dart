import 'dart:ui' as ui;

import 'package:flutter/foundation.dart' show SynchronousFuture;
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/data/pdf_pages.dart';

/// A page drawn by the test: white with grey bars where text would be. Nothing of UMass's, and no PDF renderer is ever run.
class _Synthetic extends ImageProvider<_Synthetic> {
  const _Synthetic(this.image);
  final ui.Image image;
  @override
  Future<_Synthetic> obtainKey(ImageConfiguration c) => SynchronousFuture(this);
  @override
  ImageStreamCompleter loadImage(_Synthetic key, ImageDecoderCallback decode) =>
      OneFrameImageStreamCompleter(SynchronousFuture(ImageInfo(image: image.clone())));
  @override
  bool operator ==(Object o) => o is _Synthetic && o.image == image;
  @override
  int get hashCode => image.hashCode;
}

const letter = 11 / 8.5;

/// [count] synthetic letter pages: the image is made under runAsync, so every later load is synchronous.
Future<PdfPages> syntheticPages(WidgetTester t, {int count = 2}) async {
  final img = (await t.runAsync(() async {
    final rec = ui.PictureRecorder(), c = ui.Canvas(rec);
    c.drawRect(const ui.Rect.fromLTWH(0, 0, 340, 340 * letter), ui.Paint()..color = const ui.Color(0xFFFFFFFF));
    for (var i = 0; i < 18; i++) {
      c.drawRect(ui.Rect.fromLTWH(24, 40 + i * 18.0, i.isEven ? 292 : 190, 6), ui.Paint()..color = const ui.Color(0xFF9A9A9A));
    }
    return rec.endRecording().toImage(340, (340 * letter).round());
  }))!;
  return (file, width) async => [for (var i = 0; i < count; i++) PdfPage(_Synthetic(img), letter)];
}
