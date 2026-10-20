import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/serving_text.dart';

void main() {
  test('the feed\'s ozl reads fl oz, in any case; nothing else changes', () {
    expect(servingText('16 ozl'), '16 fl oz');
    expect(servingText('20 ozl'), '20 fl oz');
    expect(servingText('16 OZL'), '16 fl oz');
    expect(servingText('1 each'), '1 each');
    expect(servingText('8 oz'), '8 oz');
    expect(servingText('1 fl oz'), '1 fl oz');
    expect(servingText('1 nozzle'), '1 nozzle');
    expect(servingText('2 ozlike'), '2 ozlike');
    expect(servingText(''), '');
  });

  test('the feed\'s EA reads each, in any case; words containing ea don\'t', () {
    expect(servingText('1 EA'), '1 each');
    expect(servingText('2 ea'), '2 each');
    expect(servingText('1 each'), '1 each');
    expect(servingText('1 meal'), '1 meal');
    expect(servingText('1 ea (12 ozl)'), '1 each (12 fl oz)');
  });
}
