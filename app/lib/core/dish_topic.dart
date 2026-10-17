import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:unorm_dart/unorm_dart.dart' as unorm;

import 'm2/board.dart' show dishKey;

/// The FCM topic a favourited dish is followed under: `dish-` + 16 hex of SHA-256 of its [dishKey] (NFC input).
/// Same rule as shared/src/dishTopic.ts and supabase/functions/_shared/dishTopic.ts (vectors: shared/vectors/dish-topic.json).
String dishTopic(String name) => 'dish-${sha256.convert(utf8.encode(dishKey(unorm.nfc(name)))).toString().substring(0, 16)}';
