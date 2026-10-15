// Events and retail-menu parsing. Port of the pure parts of shared/src/content.ts (the fetchers wait for the data layer).
import 'types.dart';

Uri? _uri(String url) => Uri.tryParse(url);

/// http(s) only. A scheme allowlist, not a host check: `javascript://umassdining.com/%0aalert(1)` has a plausible host.
String sanitizeLinkUrl(String url) {
  final u = _uri(url);
  return u != null && u.host.isNotEmpty && (u.scheme == 'http' || u.scheme == 'https') ? url : '';
}

/// The feeds sometimes return `https://default/...`: blank anything without a dotted host (or localhost).
String sanitizeImageUrl(String url) {
  final h = _uri(url)?.host ?? '';
  return h == 'localhost' || h.contains('.') ? url : '';
}

/// Exact host or a real subdomain: `umassdining.com.evil.example` must not pass.
bool isUmassDiningHost(String url) {
  final h = _uri(url)?.host ?? '';
  return h == 'umassdining.com' || h.endsWith('.umassdining.com');
}

/// A feed HTML fragment as plain text. Output is text, never markup: do not render it as HTML.
String htmlToText(String? html) {
  if (html == null || html.isEmpty) return '';
  return html
      .replaceAll(RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), '')
      .replaceAll(RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), '')
      .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'</(?:p|div|li)>', caseSensitive: false), '\n')
      .replaceAll(RegExp(r'<[^>]+>'), '')
      .replaceAll(RegExp('&nbsp;', caseSensitive: false), ' ')
      .replaceAll(RegExp('&amp;', caseSensitive: false), '&')
      .replaceAll(RegExp('&#0?39;|&rsquo;', caseSensitive: false), '’')
      .replaceAll(RegExp('&quot;', caseSensitive: false), '"')
      .replaceAll(RegExp('&lt;', caseSensitive: false), '<')
      .replaceAll(RegExp('&gt;', caseSensitive: false), '>')
      .split('\n')
      .map((l) => l.replaceAll(RegExp(r'[ \t]+'), ' ').trim())
      .where((l) => l.isNotEmpty)
      .join('\n');
}

sealed class ParsedRetailMenu {
  const ParsedRetailMenu();
}

class PdfLink {
  const PdfLink(this.url, this.label);
  final String url, label;
}

/// A café that lists its menus as PDFs: the first link as [url]/[label], every later one in [more] (RN shows only the first).
class RetailMenuPdf extends ParsedRetailMenu {
  const RetailMenuPdf({required this.url, required this.label, this.more = const []});
  final String url, label;
  final List<PdfLink> more;

  /// Every link, in the feed's order.
  List<PdfLink> get links => [PdfLink(url, label), ...more];
}

class RetailMenuItem {
  const RetailMenuItem(this.name, this.price);
  final String name;
  final String? price;
  @override
  bool operator ==(Object other) => other is RetailMenuItem && other.name == name && other.price == price;
  @override
  int get hashCode => Object.hash(name, price);
  @override
  String toString() => 'RetailMenuItem($name, $price)';
}

class RetailMenuItems extends ParsedRetailMenu {
  const RetailMenuItems(this.items);
  final List<RetailMenuItem> items;
}

class RetailMenuEmpty extends ParsedRetailMenu {
  const RetailMenuEmpty();
}

List<RetailMenuItem> _extractItems(String source) => [
      for (final chunk in source.split(RegExp(r'</(?:p|li|div)>', caseSensitive: false)))
        for (final line in htmlToText(chunk).split('\n'))
          if (line.isNotEmpty) _item(line),
    ];

RetailMenuItem _item(String line) {
  final m = RegExp(r'^(.*?)\s+(\$\d+(?:\.\d{2})?)$').firstMatch(line);
  return m == null ? RetailMenuItem(line, null) : RetailMenuItem(m[1]!.trim(), m[2]);
}

/// A retail `*_menu` fragment as a safe shape: its PDF links (umassdining.com hosts only), an item list, or nothing.
/// The raw HTML never reaches a widget.
ParsedRetailMenu parseRetailMenuHtml(String? html) {
  if (html == null || html.isEmpty) return const RetailMenuEmpty();

  final pdfs = <PdfLink>[];
  for (final link in RegExp(r'<a\b[^>]*\shref="([^"]*)"[^>]*>([\s\S]*?)</a>', caseSensitive: false).allMatches(html)) {
    final href = link[1]!;
    // The .pdf shape alone proves nothing: the viewer renders whatever Content-Type the server sends.
    if (RegExp(r'\.pdf(?:[?#]|$)', caseSensitive: false).hasMatch(href) && isUmassDiningHost(href)) {
      final url = sanitizeLinkUrl(href);
      if (url.isNotEmpty) {
        final label = htmlToText(link[2]);
        pdfs.add(PdfLink(url, label.isEmpty ? 'Menu' : label));
      }
    }
  }
  if (pdfs.isNotEmpty) return RetailMenuPdf(url: pdfs.first.url, label: pdfs.first.label, more: pdfs.sublist(1));

  // A <strong>/<b> block is a section label, not a dish.
  final items = _extractItems(html.replaceAll(RegExp(r'<(strong|b)\b[^>]*>[\s\S]*?</\1>', caseSensitive: false), ''));
  if (items.isNotEmpty) return RetailMenuItems(items);
  // A café that bolds its whole list would strip to nothing; keep the list over losing the menu.
  final unstripped = _extractItems(html);
  return unstripped.isNotEmpty ? RetailMenuItems(unstripped) : const RetailMenuEmpty();
}

/// One element of get_beacons_events' `events` (the `beacons` array is ignored).
DiningEvent mapEvent(Map<String, dynamic> e) => DiningEvent(
      title: e['title'] as String,
      featuredImage: sanitizeImageUrl(e['featured_image'] as String? ?? ''),
      pdfLink: sanitizeLinkUrl(e['pdf_link'] as String? ?? ''),
      externalLink: sanitizeLinkUrl(e['external_link'] as String? ?? ''),
      expirationDate: DateTime.fromMillisecondsSinceEpoch((e['expiration_date'] as num).toInt() * 1000, isUtc: true).toIso8601String(),
      isFeatured: e['is_featured'] == '1',
    );

List<DiningEvent> parseEvents(Map<String, dynamic> response) => [for (final e in response['events'] as List) mapEvent(e as Map<String, dynamic>)];
