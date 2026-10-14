// Port of shared/src/search.ts; shared/vectors/match-query.json is the contract.
// JS lowercases U+0130 to 'i' + U+0307 (a separator here); Dart's toLowerCase gives plain 'i'.
String _normalize(String s) => s.replaceAll('\u0130', 'i\u0307').toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), ' ').trim();

/// Token-AND match: every query token is a substring of the normalized name. No tokens matches nothing.
bool matchesQuery(String name, String query) {
  final tokens = _normalize(query).split(' ').where((t) => t.isNotEmpty);
  if (tokens.isEmpty) return false;
  final n = _normalize(name);
  return tokens.every(n.contains);
}
