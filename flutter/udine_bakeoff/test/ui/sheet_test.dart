import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/theme/tokens.dart';
import 'package:udine_bakeoff/ui/sheet.dart';

class Host extends StatefulWidget {
  final SheetHandle handle;
  final bool Function() closed;
  final void Function()? onClosed;
  const Host(this.handle, {super.key, required this.closed, this.onClosed});
  @override
  State<Host> createState() => _HostState();
}

class _HostState extends State<Host> {
  bool shut = false;
  @override
  Widget build(BuildContext context) => Directionality(
        textDirection: TextDirection.ltr,
        child: MediaQuery(
          data: const MediaQueryData(size: Size(390, 844)),
          child: shut
              ? const SizedBox()
              : M2Sheet(
                  handle: widget.handle, top: 32, mid: (m) => 400,
                  onClosed: () {
                    widget.onClosed?.call();
                    setState(() => shut = true);
                  },
                  slivers: [SliverToBoxAdapter(child: Container(height: 1400, color: const Color(0xFFEEEEEE)))],
                ),
        ),
      );
}

void main() {
  Future<void> boot(WidgetTester t, SheetHandle h, {void Function()? onClosed}) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(Host(h, closed: () => false, onClosed: onClosed));
  }

  testWidgets('opens on the spring from nothing to its resting height, and arrives at mount (the first frames already move)', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    expect(h.px, 0);
    await t.pump(const Duration(milliseconds: 16));
    await t.pump(const Duration(milliseconds: 16));
    expect(h.px, greaterThan(0));
    await t.pumpAndSettle();
    expect(h.px, closeTo(400, 0.5));
  });

  testWidgets('away runs its callback once the sheet is half-way out, before it is shut', (t) async {
    final h = SheetHandle();
    var closed = false;
    await boot(t, h, onClosed: () => closed = true);
    await t.pumpAndSettle();
    final log = <String>[];
    h.away(() => log.add('half@${h.px.round()}'));
    for (var i = 0; i < 60 && !closed; i++) {
      await t.pump(const Duration(milliseconds: 16));
    }
    expect(log, hasLength(1));
    final at = int.parse(log.single.split('@')[1]);
    expect(at, inInclusiveRange(150, 260)); // half-way out of 400, not at the bottom
    expect(closed, isTrue);
  });

  testWidgets('a drag down past the resting height snaps it shut and tells the owner', (t) async {
    final h = SheetHandle();
    var closed = false;
    await boot(t, h, onClosed: () => closed = true);
    await t.pumpAndSettle();
    await t.flingFrom(const Offset(195, 600), const Offset(0, 500), 1800);
    await t.pumpAndSettle();
    expect(closed, isTrue);
  });

  testWidgets('a drag up takes it to the top detent (status inset + 8 from the top)', (t) async {
    final h = SheetHandle();
    await boot(t, h);
    await t.pumpAndSettle();
    await t.flingFrom(const Offset(195, 600), const Offset(0, -600), 1800);
    await t.pumpAndSettle();
    expect(h.px, closeTo(844 - 32, 1));
  });

  testWidgets('the scrim follows the sheet and a tap on it closes', (t) async {
    final h = SheetHandle();
    var closed = false;
    await boot(t, h, onClosed: () => closed = true);
    await t.pumpAndSettle();
    final scrim = t.widgetList<ColoredBox>(find.byType(ColoredBox)).firstWhere((b) => b.color.a > 0 && b.color != const Color(0xFFEEEEEE));
    expect(scrim.color.a, closeTo(M2Motion.plateScrim, 0.01));
    await t.tapAt(const Offset(195, 100));
    await t.pumpAndSettle();
    expect(closed, isTrue);
  });

  testWidgets('reduced motion snaps: no frame between closed and resting', (t) async {
    final h = SheetHandle();
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(Directionality(textDirection: TextDirection.ltr, child: MediaQuery(data: const MediaQueryData(size: Size(390, 844), disableAnimations: true), child: M2Sheet(handle: h, top: 32, mid: (m) => 400, slivers: [SliverToBoxAdapter(child: Container(height: 1400))]))));
    await t.pump(const Duration(milliseconds: 16));
    await t.pump(const Duration(milliseconds: 16));
    expect(h.px, closeTo(400, 0.5));
  });
}
