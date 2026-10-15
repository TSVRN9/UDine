// Port of shared/src/search.ts; shared/vectors/match-query.json is the contract.
// JS lowercases U+0130 to 'i' + U+0307 (a separator here); Dart's toLowerCase gives plain 'i'.
String _normalize(String s) => s.replaceAll('\u0130', 'i\u0307').toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), ' ').trim();

/// The normalized words of a string (Search's tokens, and the words a place's name is matched on).
List<String> searchWords(String s) => _normalize(s).split(' ').where((t) => t.isNotEmpty).toList();

/// Token-AND match: every query token is a substring of the normalized name. No tokens matches nothing.
bool matchesQuery(String name, String query) {
  final tokens = searchWords(query);
  if (tokens.isEmpty) return false;
  final n = _normalize(name);
  return tokens.every(n.contains);
}
