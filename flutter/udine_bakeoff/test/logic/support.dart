import 'dart:convert';
import 'dart:io';
import 'package:udine_bakeoff/logic/fixture.dart';

final fx = Fixture.fromJson(jsonDecode(File('assets/fixture.json').readAsStringSync()) as Map<String, dynamic>);
final vectors = jsonDecode(File('test/vectors.json').readAsStringSync()) as Map<String, dynamic>;
const today = '2026-10-08';
