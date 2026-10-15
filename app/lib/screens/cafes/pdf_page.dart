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
  const PdfMenuPage({super.key, required this.top, required this.url, required this.label, required this.cache, required this.open, this.onRetry});
  final double top;
  final String url, label;
  final PdfCache? cache;
  final PdfOpen open;

  /// Runs before Try again loads: the repository forgets its offline window, so a deliberate retry is never skipped by it.
  final VoidCallback? onRetry;
  @override
  State<PdfMenuPage> createState() => _PdfMenuPageState();
}

class _PdfMenuPageState extends State<PdfMenuPage> with SingleTickerProviderStateMixin {
  late final AnimationController _fade;
  StreamSubscription<DataState<File>>? _sub;
  Object? _error;
  bool _notSaved = false, _started = false;
  PdfDoc? _doc;
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

  void _closeDoc() {
    _doc?.close().catchError((Object _) {}); // (a failed close has nobody left to tell)
    _doc = null;
  }

  void _load() {
    final run = ++_run, cache = widget.cache;
    _sub?.cancel();
    setState(() {
      _error = null;
      _notSaved = false;
      _closeDoc();
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
            final doc = await widget.open(value);
            if (!mounted || run != _run) {
              await doc.close();
              return;
            }
            if (waited) {
              final a = resolveAnim(context, M2Motion.settle);
              _fade.value = 0;
              _fade.animateTo(1, duration: a.duration, curve: a.curve);
            }
            setState(() => _doc = doc);
          } catch (e) {
            if (mounted && run == _run) setState(() => _error = e);
          }
      }
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _closeDoc();
    _fade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final name = menuName(widget.label);
    final Widget body;
    if (_error != null) {
      body = _line("The ${name.toLowerCase()} menu didn't load.", () {
        widget.onRetry?.call();
        _load();
      });
    } else if (_notSaved) {
      body = _line("You're offline, and this menu isn't saved on this phone.", null);
    } else if (_doc == null) {
      body = _spinner;
    } else {
      body = FadeTransition(opacity: _fade, child: PdfZoomView(key: ValueKey(_doc), doc: _doc!, label: '$name menu'));
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
/// tapped and the next returns to 1x, over `settle` (under reduced motion it snaps). The pages scroll both ways inside this box, so the bar
/// above never moves. A page is drawn when it comes within half a screen of the view, and kept: ponytail: no eviction, so a long scroll
/// holds every page it has shown; a 3-page menu is 3 images, evict far pages if a longer document ever ships.
class PdfZoomView extends StatefulWidget {
  const PdfZoomView({super.key, required this.doc, required this.label});
  final PdfDoc doc;
  final String label;
  @override
  State<PdfZoomView> createState() => _PdfZoomViewState();
}

class _PdfZoomViewState extends State<PdfZoomView> with SingleTickerProviderStateMixin {
  final _ctl = TransformationController();
  late final AnimationController _anim;
  final _img = <int, ImageProvider>{};
  final _asked = <int>{};
  Offset _tap = Offset.zero, _scene = Offset.zero;
  double _k0 = 1, _k1 = 1;
  Curve _curve = M2Motion.settle.curve;
  Size _view = Size.zero;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(vsync: this)..addListener(() => _apply(_k0 + (_k1 - _k0) * _curve.transform(_anim.value)));
    _ctl.addListener(_want);
  }

  @override
  void dispose() {
    _ctl.dispose();
    _anim.dispose();
    super.dispose();
  }

  List<double> get _aspects => widget.doc.aspects;

  double _height(double w) {
    final pw = w - 2 * M2Layout.pdfGutter;
    return M2Layout.pdfBodyTop + [for (final a in _aspects) pw * a + M2Layout.pdfPageGap].fold(0.0, (a, b) => a + b) + M2Layout.pdfBodyBottom;
  }

  /// Draws the pages near the view that aren't drawn yet, each once.
  void _want() {
    if (_view.isEmpty) return;
    final pw = _view.width - 2 * M2Layout.pdfGutter, top = _ctl.toScene(Offset.zero).dy, bottom = _ctl.toScene(Offset(0, _view.height)).dy;
    final slack = (bottom - top) * M2Layout.pdfRenderAhead;
    var y = M2Layout.pdfBodyTop;
    for (var i = 0; i < _aspects.length; i++) {
      final h = pw * _aspects[i];
      if (y + h >= top - slack && y <= bottom + slack && _asked.add(i)) {
        widget.doc.render(i, pw).then((img) {
          if (!mounted) return;
          if (img == null) {
            _asked.remove(i); // nothing came back: ask again the next time the view moves, never a blank card for good
          } else {
            setState(() => _img[i] = img);
          }
        }, onError: (Object _) {
          _asked.remove(i);
        });
      }
      y += h + M2Layout.pdfPageGap;
    }
  }

  /// The scene point under the finger stays under it, inside the pages' edges.
  void _apply(double k) {
    final h = _height(_view.width);
    final tx = (_tap.dx - _scene.dx * k).clamp(math.min(0.0, _view.width - _view.width * k), 0.0).toDouble();
    final ty = (_tap.dy - _scene.dy * k).clamp(math.min(0.0, _view.height - h * k), 0.0).toDouble();
    _ctl.value = Matrix4.identity()
      ..setTranslationRaw(tx, ty, 0)
      ..scaleByDouble(k, k, 1, 1);
  }

  /// 2.5x at the tap, or back to 1x when already zoomed.
  void _toggle() {
    _anim.stop();
    _k0 = _ctl.value.getMaxScaleOnAxis();
    _k1 = _k0 > M2Layout.pdfMinZoom ? M2Layout.pdfMinZoom : M2Layout.pdfTapZoom;
    _scene = _ctl.toScene(_tap);
    if (reducedMotion(context)) {
      _apply(_k1);
      return;
    }
    final a = M2Motion.settle;
    _curve = a.curve;
    _anim.duration = a.duration;
    _anim.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (_, c) {
          if (c.biggest != _view) {
            _view = c.biggest;
            WidgetsBinding.instance.addPostFrameCallback((_) => mounted ? _want() : null);
          }
          final pw = c.maxWidth - 2 * M2Layout.pdfGutter;
          return GestureDetector(
            onDoubleTapDown: (d) => _tap = d.localPosition,
            onDoubleTap: _toggle,
            child: InteractiveViewer(
              transformationController: _ctl,
              onInteractionStart: (_) => _anim.stop(),
              minScale: M2Layout.pdfMinZoom, maxScale: M2Layout.pdfMaxZoom,
              constrained: false,
              child: SizedBox(
                width: c.maxWidth,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(M2Layout.pdfGutter, M2Layout.pdfBodyTop, M2Layout.pdfGutter, M2Layout.pdfBodyBottom),
                  child: Column(children: [
                    for (var i = 0; i < _aspects.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: M2Layout.pdfPageGap),
                        child: Semantics(
                          image: true, label: '${widget.label}, page ${i + 1} of ${_aspects.length}',
                          child: Container(
                            width: pw, height: pw * _aspects[i],
                            decoration: const BoxDecoration(color: M2Color.white, boxShadow: [BoxShadow(color: M2Layout.pdfShadow, offset: Offset(0, M2Layout.pdfShadowDy), blurRadius: M2Layout.pdfShadowBlur)]),
                            child: _img[i] == null ? null : Image(image: _img[i]!, fit: BoxFit.fill, filterQuality: FilterQuality.medium),
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
          return PdfMenuPage(key: ValueKey(l.url), top: widget.top, url: l.url, label: l.label, cache: scope.repo.pdfs, open: scope.pdfOpen, onRetry: scope.repo.retryNetwork);
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
