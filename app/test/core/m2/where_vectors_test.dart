// Runs shared/vectors/where.json (the file Deno's _shared/where.ts reads too) against core/m2/where.dart.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import '../../../tool/where_vectors.dart';

void main() {
  final doc = jsonDecode(File('../shared/vectors/where.json').readAsStringSync()) as Map<String, dynamic>;
  for (final c in doc['cases'] as List) {
    test(c['name'], () => expect(jsonDecode(jsonEncode(whereOutput(c['input']))), c['expected']));
  }
  test('the file holds exactly the generator\'s cases', () {
    expect([for (final c in doc['cases'] as List) c['name']], [for (final c in cases) c['name']]);
  });
}
