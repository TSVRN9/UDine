import 'package:flutter/widgets.dart';
import '../logic/busy.dart';
import '../logic/fixture.dart';
import '../logic/hours.dart';
import '../logic/status.dart';
import '../motion/container_math.dart';
import '../motion/container_transform.dart';
import '../theme/tokens.dart';
import '../ui/ui.dart';

/// The container's own page: the header photo window with the name, status and busy line, over a chalk body. The menu below it
/// is Task 12. The band's copy rides on the photo while the container opens and is not drawn once it is open (a rebuild under a
/// layer whose opacity only the controller has moved must not bring it back).
class HallPage extends StatelessWidget {
  final ContainerTransform t;
  final Fixture fx;
  final String place;
  final double height;
  final double top;
  const HallPage({super.key, required this.t, required this.fx, required this.place, required this.height, required this.top});

  Widget _fade(double Function(double p) f, Widget child) => AnimatedBuilder(
        animation: t.progress,
        child: child,
        builder: (_, c) => Opacity(opacity: f(t.progress.value).clamp(0.0, 1.0), child: c),
      );

  @override
  Widget build(BuildContext context) {
    final compact = isCafe(place);
    final name = placeName(fx, place);
    final hh = headerHeight(top);
    final rect = t.rect!;
    final now = toEastern(DateTime.parse(fx.clock));
    final status = statusText(fx.hours[place]!, now);
    final busy = compact ? null : busyView(fx.busy[place]!);
    final path = photoOf(place, name);
    final photo = path == null ? null : Photo(path: path, pos: compact ? 0.5 : photoPos[place]!, duo: _ReverseAnimation(t.progress));

    return ListenableBuilder(
      listenable: t,
      builder: (_, _) => Stack(children: [
        const Positioned.fill(child: ColoredBox(color: M2Color.chalk)),
        Positioned(
          left: 0, right: 0, top: 0, height: hh,
          child: ClipRect(
            child: Stack(children: [
              const Positioned.fill(child: ColoredBox(color: M2Color.vm)),
              ?(photo == null ? null : Positioned.fill(child: photo)),
              // the header's grades develop with the photo
              Positioned.fill(
                child: _fade((p) => p, Stack(children: [
                  Positioned(left: 0, right: 0, top: 0, height: top + 80, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: M2Color.topGrade)))),
                  Positioned(left: 0, right: 0, bottom: 0, height: 240, child: DecoratedBox(decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: M2Color.bottomGrade, stops: const [0, 0.3, 0.76])))),
                ])),
              ),
              if (!compact) Positioned.fill(child: _fade(incomingOpacity, Stack(children: [HallLetter(letter: place, x: hallLx[place]!, top: top + 26)]))),
              // the band's copy: its grade fades with 1 - p, its text and letter with the early fade
              if (t.phase != Phase.open) ...[
                Positioned(left: 0, right: 0, top: rect.off, height: rect.height, child: _fade((p) => 1 - p, const BandGrade())),
                Positioned(
                  left: 0, right: 0, top: rect.off, height: rect.height,
                  child: _fade(outgoingOpacity, Band(
                    ghost: true, compact: compact, name: name, status: status,
                    busy: busy == null ? null : BusyRow(lamps: busy.lamps, word: busy.word),
                    letter: compact ? null : HallLetter(letter: place, x: hallLx[place]!),
                  )),
                ),
              ],
              Positioned.fill(
                child: _fade(incomingOpacity, Stack(children: [
                  Positioned(
                    left: M2Space.s[4], bottom: 50,
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Semantics(header: true, child: Text(name, style: M2Text.menuName.style(M2Color.white))),
                      Container(constraints: const BoxConstraints(minHeight: 20), margin: const EdgeInsets.only(top: 7), child: Text(status, style: M2Text.status.style(M2Color.onDmSoft))),
                      if (busy != null) BusyRow(lamps: busy.lamps, word: busy.word, extra: busy.extra, header: true),
                    ]),
                  ),
                ])),
              ),
            ]),
          ),
        ),
        Positioned(
          left: 4, top: top, height: 52,
          child: _fade(incomingOpacity, Center(child: Press(label: 'Back', scale: true, onTap: t.close, child: const SizedBox(width: 48, height: 48, child: CustomPaint(painter: _BackIcon()))))),
        ),
      ]),
    );
  }
}

class _ReverseAnimation extends Animation<double> with AnimationWithParentMixin<double> {
  _ReverseAnimation(this.parent);
  @override
  final Animation<double> parent;
  @override
  double get value => 1 - parent.value;
}

class _BackIcon extends CustomPainter {
  const _BackIcon();
  @override
  void paint(Canvas canvas, Size s) {
    canvas.translate((s.width - 24) / 2, (s.height - 24) / 2);
    canvas.drawPath(
      Path()..moveTo(15, 5)..relativeLineTo(-7, 7)..relativeLineTo(7, 7),
      Paint()..color = M2Color.white..style = PaintingStyle.stroke..strokeWidth = 2.2..strokeCap = StrokeCap.round..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_BackIcon old) => false;
}
