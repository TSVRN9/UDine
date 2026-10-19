/// A serving as shown: the feed's liquid unit "ozl" reads "fl oz". Display only; the log, the export and the menu cache keep the feed's string.
String servingText(String s) => s.replaceAllMapped(RegExp(r'\bozl\b', caseSensitive: false), (_) => 'fl oz');
