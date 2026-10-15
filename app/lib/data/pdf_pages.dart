import 'dart:io';

import 'package:flutter/painting.dart' show ImageProvider, MemoryImage;
import 'package:pdfx/pdfx.dart';

import '../theme/tokens.dart' show M2Layout;

/// One page of a menu, drawn: [aspect] is height over width.
class PdfPage {
  const PdfPage(this.image, this.aspect);
  final ImageProvider image;
  final double aspect;
}

/// Draws every page of [file] to fit [width] logical pixels. The seam: the app uses [pdfxPages]; tests hand in synthetic pages, so no test
/// (and no golden) ever runs a PDF renderer or shows a PDF.
typedef PdfPages = Future<List<PdfPage>> Function(File file, double width);

/// pdfx: the platform's own renderer (Android PdfRenderer, iOS PDFKit), so the app bundles no PDF engine. A page is drawn on white.
Future<List<PdfPage>> pdfxPages(File file, double width) async {
  final doc = await PdfDocument.openFile(file.path);
  try {
    final out = <PdfPage>[];
    for (var i = 1; i <= doc.pagesCount; i++) {
      final page = await doc.getPage(i);
      try {
        final aspect = page.height / page.width;
        final w = width * M2Layout.pdfRenderScale;
        final img = await page.render(width: w, height: w * aspect, format: PdfPageImageFormat.png, backgroundColor: '#FFFFFF');
        if (img != null) out.add(PdfPage(MemoryImage(img.bytes), aspect));
      } finally {
        await page.close();
      }
    }
    return out;
  } finally {
    await doc.close();
  }
}
