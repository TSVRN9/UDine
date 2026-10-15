import 'dart:async';
import 'dart:io';
import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import '../../core/content.dart' show PdfLink, RetailMenuPdf, menuName;
import '../../core/m2/places.dart' show cafeTable, straight;
import '../../data/repository.dart' show resolveCafeMenu, StandingCafeMenu;
import '../../shell/app_scope.dart';
import '../../data/pdf_cache.dart';
import '../../data/pdf_pages.dart';
import '../../data/states.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';
import '../hall/meal_list.dart' show StateLine;
import 'hours_feed.dart';

/// `.mstate` under the bar: a 160 dp block with the indicator in it, on the page's top padding.
const _spinner = Align(alignment: Alignment.topCenter, child: Padding(padding: EdgeInsets.only(top: M2Layout.pdfBodyTop), child: SizedBox(height: M2Size.mstate, child: Center(child: Spinner()))));

/// One café menu PDF as a pushed page (R11 §3): the maroon bar titled "Name menu", and under it the PDF's pages at the screen's width,
/// one under another, on chalk. Loading is the spinner (it shows itself after 400 ms), then the pages fade in where they end up; a menu
/// kept on the phone opens at once. Not saved (offline) and failed say so, with Try again for a failure.
class PdfMenuPage extends StatefulWidget {
  const PdfMenuPage({super.key, required this.top, required this.url, required this.label, required this.cache, required this.pages});
  final double top;
  final String url, label;
  final PdfCache? cache;
  final PdfPages pages;
  @override
  State<PdfMenuPage> createState() => _PdfMenuPageState();
}

class _PdfMenuPageState extends State<PdfMenuPage> with SingleTickerProviderStateMixin {
  late final AnimationController _fade;
  StreamSubscription<DataState<File>>? _sub;
  Object? _error;
  bool _notSaved = false, _started = false;
  List<PdfPage>? _pages;
  int _run = 0;

  @override
  void initState() {
    super.initState();
    _fade = AnimationController(vsync: this, value: 1);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _load();
    }
  }

  double get _pageWidth => MediaQuery.sizeOf(context).width - 2 * M2Space.gutter;

  void _load() {
    final run = ++_run, cache = widget.cache, width = _pageWidth;
    _sub?.cancel();
    setState(() {
      _error = null;
      _notSaved = false;
      _pages = null;
    });
    if (cache == null) {
      setState(() => _error = StateError('no place to keep PDFs'));
      return;
    }
    var waited = false;
    _sub = cache.open(widget.url).listen((s) async {
      switch (s) {
        case Loading() || StillLoading():
          waited = true;
        case NotSaved():
          if (mounted && run == _run) setState(() => _notSaved = true);
        case Failed(:final error):
          if (mounted && run == _run) setState(() => _error = error);
        case Loaded(:final value) || LoadedOffline(:final value):
          try {
            final pages = await widget.pages(value, width);
            if (!mounted || run != _run) return;
            if (waited) {
              final a = resolveAnim(context, M2Motion.settle);
              _fade.value = 0;
              _fade.animateTo(1, duration: a.duration, curve: a.curve);
            }
            setState(() => _pages = pages);
          } catch (e) {
            if (mounted && run == _run) setState(() => _error = e);
          }
      }
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _fade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final name = menuName(widget.label);
    final Widget body;
    if (_error != null) {
      body = _line("The ${name.toLowerCase()} menu didn't load.", _load);
    } else if (_notSaved) {
      body = _line("You're offline, and this menu isn't saved on this phone.", null);
    } else if (_pages == null) {
      body = _spinner;
    } else {
      body = FadeTransition(opacity: _fade, child: PdfZoomView(pages: _pages!, label: '$name menu'));
    }
    return ColoredBox(
      color: M2Color.chalk,
      child: Column(children: [
        ScreenHeader.page(top: widget.top, title: '$name menu', onBack: () => Navigator.of(context).maybePop()),
        Expanded(child: body),
      ]),
    );
  }

  Widget _line(String text, VoidCallback? retry) => Padding(
        padding: const EdgeInsets.only(top: M2Layout.pdfBodyTop),
        child: SingleChildScrollView(child: StateLine(text: text, onRetry: retry)),
      );
}

/// The pages, one under another at the screen's width less the gutters. Pinch zooms 1x to 4x; a double tap zooms to 2.5x at the point
/// tapped and the next returns to 1x. The pages scroll both ways inside this box, so the bar above never moves.
class PdfZoomView extends StatefulWidget {
  const PdfZoomView({super.key, required this.pages, required this.label});
  final List<PdfPage> pages;
  final String label;
  @override
  State<PdfZoomView> createState() => _PdfZoomViewState();
}

class _PdfZoomViewState extends State<PdfZoomView> {
  final _ctl = TransformationController();
  Offset _tap = Offset.zero;

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  double _height(double w) {
    final pw = w - 2 * M2Space.gutter;
    return M2Layout.pdfBodyTop + [for (final p in widget.pages) pw * p.aspect + M2Layout.pdfPageGap].fold(0.0, (a, b) => a + b) + M2Layout.pdfBodyBottom;
  }

  /// 2.5x at the tap, or back to 1x when already zoomed: the scene point under the finger stays under it, inside the pages' edges.
  void _toggle(Size view) {
    final zoomed = _ctl.value.getMaxScaleOnAxis() > M2Layout.pdfMinZoom, k = zoomed ? M2Layout.pdfMinZoom : M2Layout.pdfTapZoom;
    final scene = _ctl.toScene(_tap), h = _height(view.width);
    final tx = (_tap.dx - scene.dx * k).clamp(math.min(0.0, view.width - view.width * k), 0.0).toDouble();
    final ty = (_tap.dy - scene.dy * k).clamp(math.min(0.0, view.height - h * k), 0.0).toDouble();
    _ctl.value = Matrix4.identity()
      ..setTranslationRaw(tx, ty, 0)
      ..scaleByDouble(k, k, 1, 1);
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (_, c) {
          final pw = c.maxWidth - 2 * M2Space.gutter;
          return GestureDetector(
            onDoubleTapDown: (d) => _tap = d.localPosition,
            onDoubleTap: () => _toggle(c.biggest),
            child: InteractiveViewer(
              transformationController: _ctl,
              minScale: M2Layout.pdfMinZoom, maxScale: M2Layout.pdfMaxZoom,
              constrained: false,
              child: SizedBox(
                width: c.maxWidth,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(M2Space.gutter, M2Layout.pdfBodyTop, M2Space.gutter, M2Layout.pdfBodyBottom),
                  child: Column(children: [
                    for (var i = 0; i < widget.pages.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: M2Layout.pdfPageGap),
                        child: Semantics(
                          image: true, label: '${widget.label}, page ${i + 1} of ${widget.pages.length}',
                          child: Container(
                            width: pw, height: pw * widget.pages[i].aspect,
                            decoration: const BoxDecoration(color: M2Color.white, boxShadow: [BoxShadow(color: M2Layout.pdfShadow, offset: Offset(0, M2Layout.pdfShadowDy), blurRadius: M2Layout.pdfShadowBlur)]),
                            child: Image(image: widget.pages[i].image, fit: BoxFit.fill, filterQuality: FilterQuality.medium),
                          ),
                        ),
                      ),
                  ]),
                ),
              ),
            ),
          );
        },
      );
}

/// `/cafe/<n>/menu/<m>` as a launch route (screenshots, deep links): the café's m-th PDF, once the hours say which it is. Until then, the
/// bar and the spinner.
class PdfMenuByIndex extends StatefulWidget {
  const PdfMenuByIndex({super.key, required this.place, required this.index, required this.top});
  final String place;
  final int index;
  final double top;
  @override
  State<PdfMenuByIndex> createState() => _PdfMenuByIndexState();
}

class _PdfMenuByIndexState extends State<PdfMenuByIndex> {
  HoursFeed? _hours;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _hours ??= HoursFeed(AppScope.of(context).repo);
  }

  @override
  void dispose() {
    _hours?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    return ListenableBuilder(
      listenable: _hours!,
      builder: (context, _) {
        final title = straight(cafeTable[int.parse(widget.place.substring(1))].title);
        final loc = _hours!.data?.feed.retail.where((r) => straight(r.name) == title).firstOrNull;
        final m = loc == null ? null : resolveCafeMenu(const [], loc), menu = m is StandingCafeMenu ? m.menu : null;
        final links = menu is RetailMenuPdf ? menu.links : const <PdfLink>[];
        if (widget.index < links.length) {
          final l = links[widget.index];
          return PdfMenuPage(key: ValueKey(l.url), top: widget.top, url: l.url, label: l.label, cache: scope.repo.pdfs, pages: scope.pdfPages);
        }
        return ColoredBox(
          color: M2Color.chalk,
          child: Column(children: [
            ScreenHeader.page(top: widget.top, title: 'Menu', onBack: () => Navigator.of(context).maybePop()),
            const Expanded(child: _spinner),
          ]),
        );
      },
    );
  }
}
