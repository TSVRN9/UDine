// Runs shared/vectors/dish-topic.json (the same file the TS and Deno suites read) against core/dish_topic.dart.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/dish_topic.dart';

void main() {
  final doc = jsonDecode(File('../shared/vectors/dish-topic.json').readAsStringSync()) as Map<String, dynamic>;
  for (final c in doc['cases'] as List) {
    test(c['name'], () => expect(dishTopic(c['input']['name']), c['expected']));
  }
}
