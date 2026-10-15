import 'dart:io';
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

class FakeDoc implements PdfDoc {
  FakeDoc(this.image, this.count, this.rendered);
  final ui.Image image;
  final int count;
  final List<int> rendered;
  bool closed = false;
  @override
  List<double> get aspects => [for (var i = 0; i < count; i++) letter];
  @override
  Future<ImageProvider?> render(int index, double width) async {
    rendered.add(index);
    return _Synthetic(image);
  }

  @override
  Future<void> close() async => closed = true;
}

/// A [PdfOpen] over synthetic letter pages; [rendered] lists every page asked for, in order, and [docs] every document opened.
class SyntheticPdf {
  SyntheticPdf(this._image, this.count);
  final ui.Image _image;
  final int count;
  final rendered = <int>[];
  final docs = <FakeDoc>[];
  Future<PdfDoc> call(File file) async {
    final d = FakeDoc(_image, count, rendered);
    docs.add(d);
    return d;
  }
}

/// [count] synthetic letter pages: the image is made under runAsync, so every later load is synchronous.
Future<SyntheticPdf> syntheticPages(WidgetTester t, {int count = 2}) async {
  final img = (await t.runAsync(() async {
    final rec = ui.PictureRecorder(), c = ui.Canvas(rec);
    c.drawRect(const ui.Rect.fromLTWH(0, 0, 340, 340 * letter), ui.Paint()..color = const ui.Color(0xFFFFFFFF));
    for (var i = 0; i < 18; i++) {
      c.drawRect(ui.Rect.fromLTWH(24, 40 + i * 18.0, i.isEven ? 292 : 190, 6), ui.Paint()..color = const ui.Color(0xFF9A9A9A));
    }
    return rec.endRecording().toImage(340, (340 * letter).round());
  }))!;
  return SyntheticPdf(img, count);
}
