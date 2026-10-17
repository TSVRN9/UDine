import 'dart:math' as math;

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../core/m2/board.dart' show Macro;
import '../../shell/app_scope.dart';
import '../../shell/shell_scope.dart';
import '../../theme/tokens.dart';
import '../../ui/ui.dart';

/// M2 `openCustom`: the custom food form, raised above everything at its top detent. This is the one call Search's no-match row and a
/// menu-less café make; `name` is what Search had typed (the cursor then starts at Calories, else at Name), `meal` is the plate the food
/// joins (Search's meal; a café's is the meal the clock is in). Add to plate puts it on the plate and keeps it on the phone (Your foods), as RN
/// does; with no store (a newer build owns the database) nothing is kept, and tracking is off besides.
SheetHandle openCustomFood(
  BuildContext context, {
  String name = '',
  required String meal,
  String cal = '',
  String p = '',
  String c = '',
  String f = '',
}) {
  final scope = AppScope.of(context), plate = scope.plate;
  return ShellScope.of(context).pushSheet(
    (handle, done) => CustomFoodSheet(
      handle: handle,
      name: name,
      cal: cal,
      p: p,
      c: c,
      f: f,
      onAdd: (n, m) {
        final foods = scope.foods;
        if (foods == null) {
          plate.add(meal, n, const {}, m);
        } else {
          // (kept first, so the plate row is the food's own: logged under its custom_foods id)
          foods.addCustom(n, m).then((f) => plate.addFood(meal, f)).catchError((
            Object e,
          ) {
            debugPrint('udine: the custom food was not kept: $e');
            plate.add(meal, n, const {}, m);
          });
        }
        Haptics.add();
        handle.close();
      },
      onClosed: done,
    ),
  );
}

/// M2's `submit` handler: the trimmed name and the macros, or null when the form is not valid (no name, or no calories). A macro left
/// empty is 0, a comma is a decimal point, and a negative number is not valid.
(String, Macro)? parseCustomFood({
  required String name,
  required String cal,
  required String p,
  required String c,
  required String f,
}) {
  final n = name.trim();
  if (n.isEmpty || cal.trim().isEmpty) return null;
  num v(String s) => num.tryParse(s.trim().replaceAll(',', '.')) ?? 0;
  final m = Macro(v(cal), v(p), v(c), v(f));
  // (a negative would take calories off the day's total)
  return m.cal < 0 || m.p < 0 || m.c < 0 || m.f < 0 ? null : (n, m);
}

/// `#cform` in `#isheet`: the custom food form raised in its own sheet, at its top detent.
class CustomFoodSheet extends StatelessWidget {
  final SheetHandle handle;
  final String name, cal, p, c, f;
  final void Function(String name, Macro macro) onAdd;
  final VoidCallback onClosed;
  const CustomFoodSheet({
    super.key,
    required this.handle,
    this.name = '',
    this.cal = '',
    this.p = '',
    this.c = '',
    this.f = '',
    required this.onAdd,
    required this.onClosed,
  });

  @override
  Widget build(BuildContext context) => M2Sheet(
    handle: handle,
    top: safeTop(context) + M2Layout.sheetTop,
    onClosed: onClosed,
    mid: (m) => m.height,
    header: const SheetGrab(),
    slivers: [
      FoodFormSliver(
        title: 'Custom food',
        name: name,
        cal: cal,
        p: p,
        c: c,
        f: f,
        primary: 'Add to plate',
        onSubmit: onAdd,
      ),
    ],
  );
}

/// The form itself, as a sliver: the title, Name, a two-by-two of Calories, Protein, Carbs and Fat, and the button (Add to plate; or Save, with
/// a Delete under it when the food is being edited). A sheet puts it in its own scroll, so the keyboard never covers the button: the custom
/// food sheet, and a saved food's sheet when Edit turns it into this form in place.
class FoodFormSliver extends StatefulWidget {
  final String title, primary;
  final String name, cal, p, c, f;
  final void Function(String name, Macro macro) onSubmit;
  final VoidCallback? onDelete;

  /// the opacity the form fades in from when it takes the place of another view (Edit); 1 draws it at once
  final double fadeFrom;
  const FoodFormSliver({
    super.key,
    required this.title,
    required this.primary,
    this.name = '',
    this.cal = '',
    this.p = '',
    this.c = '',
    this.f = '',
    required this.onSubmit,
    this.onDelete,
    this.fadeFrom = 1,
  });
  @override
  State<FoodFormSliver> createState() => _FoodFormSliverState();
}

class _FoodFormSliverState extends State<FoodFormSliver> {
  late final _name = TextEditingController(text: widget.name),
      _cal = TextEditingController(text: widget.cal);
  late final _p = TextEditingController(text: widget.p),
      _c = TextEditingController(text: widget.c),
      _f = TextEditingController(text: widget.f);
  final _nameFocus = FocusNode(),
      _calFocus = FocusNode(),
      _pFocus = FocusNode(),
      _cFocus = FocusNode(),
      _fFocus = FocusNode();

  final _btn = GlobalKey();
  double _inset = 0;
  late final _nodes = [_nameFocus, _calFocus, _pFocus, _cFocus, _fFocus];

  /// With the keyboard up, scrolls the sheet (never at rest) so the whole button shows above it; where that would push the focused field
  /// off the top, the field wins. The sheet is as tall as the frame, so the keyboard covers its lower part and the scroll view cannot
  /// know: the visible area ends where the keyboard begins.
  void _reveal() {
    if (!mounted || _inset <= 0) return;
    final b = _btn.currentContext,
        pos = b == null ? null : Scrollable.maybeOf(b)?.position;
    if (b == null || pos == null) return;
    final limit = MediaQuery.sizeOf(context).height - _inset,
        bb = b.findRenderObject()! as RenderBox;
    var d =
        bb.localToGlobal(Offset(0, bb.size.height)).dy +
        M2Layout.formGap -
        limit;
    final f = _nodes
        .where((n) => n.hasPrimaryFocus)
        .firstOrNull
        ?.context
        ?.findRenderObject();
    if (f is RenderBox && f.attached) {
      final top =
          (Scrollable.maybeOf(b)!.context.findRenderObject()! as RenderBox)
              .localToGlobal(Offset.zero)
              .dy;
      d = math.min(d, f.localToGlobal(Offset.zero).dy - top);
      d = math.max(
        d,
        f.localToGlobal(Offset(0, f.size.height)).dy + M2Layout.formGap - limit,
      );
    }
    if (d <= 0) return;
    final a = resolveAnim(context, M2Motion.settle);
    pos.animateTo(
      (pos.pixels + d).clamp(pos.minScrollExtent, pos.maxScrollExtent),
      duration: a.duration,
      curve: a.curve,
    );
  }

  void _onFocus() =>
      WidgetsBinding.instance.addPostFrameCallback((_) => _reveal());

  @override
  void initState() {
    super.initState();
    for (final n in _nodes) {
      n.addListener(_onFocus);
    }
    // M2 focuses at once, or iOS will not raise the keyboard: with a name the cursor starts at Calories, else at Name
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => (widget.name.isEmpty ? _nameFocus : _calFocus).requestFocus(),
    );
  }

  @override
  void dispose() {
    for (final x in [_name, _cal, _p, _c, _f]) {
      x.dispose();
    }
    for (final x in _nodes) {
      x.dispose();
    }
    super.dispose();
  }

  void _submit() {
    final r = parseCustomFood(
      name: _name.text,
      cal: _cal.text,
      p: _p.text,
      c: _c.text,
      f: _f.text,
    );
    if (r == null) {
      (_name.text.trim().isEmpty ? _nameFocus : _calFocus)
          .requestFocus(); // (a browser focuses the first field it refuses)
      return;
    }
    FocusManager.instance.primaryFocus?.unfocus();
    widget.onSubmit(r.$1, r.$2);
  }

  @override
  Widget build(BuildContext context) {
    const decimal = TextInputType.numberWithOptions(decimal: true);
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    if (inset != _inset) {
      _inset = inset;
      WidgetsBinding.instance.addPostFrameCallback((_) => _reveal());
    }
    return SliverLayoutBuilder(
      builder: (_, c) => SliverToBoxAdapter(
        child: Arrive(
          from: widget.fadeFrom,
          child: ConstrainedBox(
            // (room to scroll the form clear of the keyboard: the sheet is as tall as the frame)
            constraints: BoxConstraints(
              minHeight: inset > 0 ? c.viewportMainAxisExtent + inset : 0,
            ),
            child: Padding(
              padding: EdgeInsets.fromLTRB(
                M2Space.gutter,
                0,
                M2Space.gutter,
                MediaQuery.viewInsetsOf(context).bottom,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Padding(
                    padding: const EdgeInsets.only(
                      top: M2Layout.sheetTitleTop,
                      // (`.sh1`'s 6 below collapses into the first label's 12 above: no bottom)
                    ),
                    child: Semantics(
                      header: true,
                      child: Text(
                        widget.title,
                        style: M2Layout.plateLabelHead.style(M2Color.dm),
                      ),
                    ),
                  ),
                  _Field(
                    'Name',
                    _name,
                    focus: _nameFocus,
                    action: TextInputAction.next,
                  ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _Field(
                          'Calories',
                          _cal,
                          focus: _calFocus,
                          type: decimal,
                          action: TextInputAction.next,
                        ),
                      ),
                      const SizedBox(width: M2Layout.formGap),
                      Expanded(
                        child: _Field(
                          'Protein (g)',
                          _p,
                          focus: _pFocus,
                          type: decimal,
                          action: TextInputAction.next,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: _Field(
                          'Carbs (g)',
                          _c,
                          focus: _cFocus,
                          type: decimal,
                          action: TextInputAction.next,
                        ),
                      ),
                      const SizedBox(width: M2Layout.formGap),
                      Expanded(
                        child: _Field(
                          'Fat (g)',
                          _f,
                          focus: _fFocus,
                          type: decimal,
                          action: TextInputAction.done,
                          onSubmit: _submit,
                        ),
                      ),
                    ],
                  ),
                  Padding(
                    padding: const EdgeInsets.only(top: M2Layout.formBtnTop),
                    child: Button(
                      key: _btn,
                      kind: ButtonKind.primary,
                      label: widget.primary,
                      expand: true,
                      onTap: _submit,
                    ),
                  ),
                  if (widget.onDelete != null)
                    Padding(
                      padding: const EdgeInsets.only(top: M2Layout.fdelTop),
                      child: Center(
                        child: TextAction('Delete', onTap: widget.onDelete),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// `.form label` over `.form input`.
class _Field extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final FocusNode focus;
  final TextInputType? type;
  final TextInputAction action;
  final VoidCallback? onSubmit;
  const _Field(
    this.label,
    this.controller, {
    required this.focus,
    this.type,
    required this.action,
    this.onSubmit,
  });

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Padding(
        padding: const EdgeInsets.only(
          top: M2Layout.formLabelTop,
          bottom: M2Layout.formLabelBottom,
        ),
        child: ExcludeSemantics(
          child: Text(label, style: M2Layout.formLabel.style(M2Color.slate)),
        ),
      ),
      Semantics(
        label: label,
        child: Container(
          height: M2Layout.formFieldH,
          padding: const EdgeInsets.symmetric(horizontal: M2Layout.fieldPadX),
          alignment: Alignment.centerLeft,
          decoration: const BoxDecoration(
            color: M2Layout.fieldFill,
            borderRadius: BorderRadius.all(Radius.circular(M2Radius.button)),
          ),
          child: EditableText(
            controller: controller,
            focusNode: focus,

            keyboardType: type,
            textInputAction: action,
            style: M2Layout.formInput.style(M2Color.ink),
            cursorColor: M2Color.ink,
            backgroundCursorColor: M2Color.slate,
            onSubmitted: (_) => onSubmit?.call(),
          ),
        ),
      ),
    ],
  );
}
