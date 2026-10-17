import 'dart:io';

import 'package:flutter/painting.dart' show ImageProvider, MemoryImage;
import 'package:pdfx/pdfx.dart';

import '../theme/tokens.dart' show M2Layout;

/// An open PDF. Layout needs every page's shape at once ([aspects], height over width) but a page is only drawn when it nears the screen
/// ([render]), so a long menu costs one page of memory at a time it is looked at, not all of them at open.
abstract class PdfDoc {
  List<double> get aspects;

  /// Page [index] drawn to fit [width] logical pixels, on white; null when the renderer gave nothing.
  Future<ImageProvider?> render(int index, double width);
  Future<void> close();
}

/// The seam: the app uses [pdfxOpen]; tests hand in synthetic documents, so no test (and no golden) ever runs a PDF renderer or shows a PDF.
typedef PdfOpen = Future<PdfDoc> Function(File file);

/// pdfx: the platform's own renderer (Android PdfRenderer, iOS PDFKit), so the app bundles no PDF engine.
Future<PdfDoc> pdfxOpen(File file) async {
  final doc = await PdfDocument.openFile(file.path);
  try {
    final aspects = <double>[];
    for (var i = 1; i <= doc.pagesCount; i++) {
      final page = await doc.getPage(i);
      aspects.add(page.height / page.width);
      await page.close();
    }
    return _PdfxDoc(doc, aspects);
  } catch (_) {
    await doc.close();
    rethrow;
  }
}

class _PdfxDoc implements PdfDoc {
  _PdfxDoc(this._doc, this.aspects);
  final PdfDocument _doc;
  @override
  final List<double> aspects;

  /// Android allows one open page at a time: renders (and the close) queue behind one another.
  Future<void> _last = Future.value();

  Future<T> _queued<T>(Future<T> Function() job) {
    final r = _last.then((_) => job());
    _last = r.then<void>((_) {}, onError: (_) {});
    return r;
  }

  @override
  Future<ImageProvider?> render(int index, double width) => _queued(() async {
        final page = await _doc.getPage(index + 1);
        try {
          final w = width * M2Layout.pdfRenderScale, h = w * aspects[index];
          final img = await page.render(width: w, height: h, format: PdfPageImageFormat.png, backgroundColor: '#FFFFFF');
          return img == null ? null : MemoryImage(img.bytes);
        } finally {
          await page.close();
        }
      });

  @override
  Future<void> close() => _queued(_doc.close);
}
