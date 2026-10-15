// The "Deleted <hall> lunch" receipt in the plate bar's slot (flutter-port-you Task 1): it lives like Log's receipt, with the same Undo,
// the same timeout, and a dish added to a plate ends it. The log is re-read after Log and Undo so You is never behind.
import 'package:fake_async/fake_async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/m2/board.dart';
import 'package:udine/shell/plate_model.dart';
import 'package:udine/theme/tokens.dart';
import '../core/m2/support.dart';

void main() {
  test('shows its line, Undo runs the way back and the receipt is gone', () async {
    var undone = 0;
    final m = PlateModel();
    m.showDeleted('Deleted Worcester lunch', () async => undone++);
    expect(m.deleted?.text, 'Deleted Worcester lunch');
    expect(await m.undo(), isTrue);
    expect((undone, m.deleted), (1, null));
  });

  test('times out like the Log receipt', () {
    fakeAsync((a) {
      final m = PlateModel()..showDeleted('Deleted lunch', () async {});
      a.elapse(Duration(milliseconds: M2Motion.receiptD - 1));
      expect(m.deleted, isNotNull);
      a.elapse(const Duration(milliseconds: 2));
      expect(m.deleted, isNull);
    });
  });

  test('a dish added to a plate ends it', () {
    final m = PlateModel()..showDeleted('Deleted lunch', () async {});
    m.add('lunch', 'Golden BBQ Chicken Thigh', {'W': servingOn(board, today, 'W', 'lunch', dishKey('Golden BBQ Chicken Thigh'))!});
    expect(m.deleted, isNull);
  });

  test('an Undo that fails keeps the receipt and says so; Try again runs it again', () async {
    var tries = 0;
    final m = PlateModel()..showDeleted('Deleted lunch', () async => ++tries == 1 ? throw StateError('disk') : null);
    expect(await m.undo(), isFalse);
    expect((m.failure, m.deleted != null), (PlateFailure.undo, true));
    expect(await m.retry(), isTrue);
    expect((tries, m.deleted, m.failure), (2, null, null));
  });
}
