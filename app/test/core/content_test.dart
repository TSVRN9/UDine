// Port of shared/src/content.test.ts (events, htmlToText, parseRetailMenuHtml). Captures: fixtures/content_captures.dart.
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:udine/core/content.dart';

import 'fixtures/content_captures.dart';

Map<String, dynamic> event({String image = '', String pdf = '', String link = '', num exp = 0, String featured = '0'}) =>
    {'title': 'x', 'featured_image': image, 'pdf_link': pdf, 'external_link': link, 'expiration_date': exp, 'is_featured': featured};

List<RetailMenuItem> items(String? html) {
  final p = parseRetailMenuHtml(html);
  expect(p, isA<RetailMenuItems>());
  return (p as RetailMenuItems).items;
}

void main() {
  group('events', () {
    test('unix-seconds expiration becomes ISO, featured flag is a bool', () {
      final m = mapEvent(summerHoursEvent);
      expect(m.expirationDate, '2026-08-31T04:00:00.000Z');
      expect(m.isFeatured, false);
      expect(m.title, 'Summer Hours');
      expect(m.pdfLink, summerHoursEvent['pdf_link']);
    });

    test('javascript:, data: and host-faking javascript: links are blanked', () {
      for (final bad in ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'javascript://umassdining.com/%0aalert(1)']) {
        final m = mapEvent(event(pdf: bad, link: bad));
        expect((m.pdfLink, m.externalLink), ('', ''), reason: bad);
      }
    });

    test('http and https links pass through', () {
      final m = mapEvent(event(pdf: 'http://umassdining.com/sites/default/files/events/poster.jpg', link: 'https://umassdining.com/events/fall-fest'));
      expect((m.pdfLink, m.externalLink), ('http://umassdining.com/sites/default/files/events/poster.jpg', 'https://umassdining.com/events/fall-fest'));
    });

    test("is_featured '1' is true", () => expect(mapEvent(event(featured: '1')).isFeatured, true));

    test("an unresolvable 'default' image host is blanked", () {
      expect(mapEvent(event(image: 'https://default/sites/default/files/events/banner.jpg')).featuredImage, '');
      expect(mapEvent(event(image: 'https://umassdining.com/a.jpg')).featuredImage, 'https://umassdining.com/a.jpg');
    });

    test('parseEvents reads the events array and ignores beacons (captured events-raw.json)', () {
      final raw = jsonDecode(File('../docs/design/explorations/2026-10-ui-overhaul/flows/events-raw.json').readAsStringSync());
      final events = parseEvents(raw as Map<String, dynamic>);
      expect(events.map((e) => e.title), ['Indigenous Peoples Day', ' Indigenous Peoples Day Hours', 'October Event', 'Pete and Gerry', 'Sustainability is on the menu']);
      expect(events.first.expirationDate, '2026-10-12T04:00:00.000Z');
    });
  });

  group('htmlToText', () {
    test('strips tags, decodes entities, keeps block breaks', () {
      expect(htmlToText('<p>1 Campus Center Way<br/>Amherst, MA 01003</p>'), '1 Campus Center Way\nAmherst, MA 01003');
      expect(htmlToText('<p>Turkey &amp; Bacon</p>'), 'Turkey & Bacon');
    });
    test('null and empty are empty', () {
      expect((htmlToText(null), htmlToText('')), ('', ''));
    });
    test('script and style vanish with their bodies', () {
      expect(htmlToText('<p>Hi</p><script>alert(document.cookie)</script><style>.x{color:red}</style>'), 'Hi');
    });
  });

  group('parseRetailMenuHtml', () {
    test('real name-only list, entity-decoded, no price', () {
      final got = items(peoplesOrganicBreakfastMenu);
      expect(got, hasLength(8));
      expect(got[0], const RetailMenuItem('Bacon Croissant', null));
      expect(got[2], const RetailMenuItem('Turkey & Bacon', null));
    });

    test("a trailing '\$X.XX' splits into name and price", () {
      expect(items(r'<p>Espresso $3.00</p><p>Bagel</p>'), const [RetailMenuItem('Espresso', r'$3.00'), RetailMenuItem('Bagel', null)]);
    });

    test('<br>-separated lines in one block are separate priced items', () {
      expect(items(brSeparatedMenu), const [
        RetailMenuItem('Chai Latte', r'$3.75'),
        RetailMenuItem('Matcha Latte', r'$4.25'),
        RetailMenuItem('Green Tea', r'$2.50'),
        RetailMenuItem('Black Tea', null),
      ]);
    });

    test('a <strong> section heading is not a dish', () {
      final names = items(argoTeaBreakfastMenu).map((i) => i.name).toList();
      expect(names.any((n) => n.contains('Sample Menu items')), isFalse);
      expect(names, containsAll(['Black tea Hot or Iced', 'Blueberry Muffin']));
    });

    test('a menu that is entirely bold falls back to the unstripped list', () {
      expect(items(allBoldMenu), const [RetailMenuItem('Chai Latte', r'$3.75'), RetailMenuItem('Matcha Latte', r'$4.25')]);
    });

    test('a real PDF link menu (babyBerk) is a pdf with its label', () {
      final p = parseRetailMenuHtml(babyBerkBreakfastMenu) as RetailMenuPdf;
      expect(p.url, 'https://umassdining.com/sites/default/files/2025-08/Baby%20Berk%201%20FA25_compressed.pdf');
      expect(p.label, 'Baby Berk Menu');
    });

    test('the PDF host gate: only umassdining.com or a real subdomain', () {
      expect(parseRetailMenuHtml('<p><a href="javascript:alert(1)//x.pdf">Menu</a></p>'), isNot(isA<RetailMenuPdf>()));
      expect(parseRetailMenuHtml('<p><a href="https://evil.example/redir?to=x#.pdf">Menu</a></p>'), isNot(isA<RetailMenuPdf>()));
      expect(parseRetailMenuHtml('<p><a href="https://umassdining.com.evil.example/x.pdf">Menu</a></p>'), isNot(isA<RetailMenuPdf>()));
      expect(parseRetailMenuHtml('<p><a href="https://cdn.umassdining.com/menus/fall.pdf">Fall Menu</a></p>'), isA<RetailMenuPdf>());
    });

    test('every PDF link is kept, in the feed order (The Commonwealth lists four)', () {
      final p = parseRetailMenuHtml(commonwealthBreakfastMenu) as RetailMenuPdf;
      expect([for (final l in p.links) l.label], ['Click here for the Lunch Menu', 'Click here for the Lite Fare Menu', 'Click here for the Dinner Menu', 'Click here for the Dessert Menu']);
      expect(p.url, p.links.first.url);
      expect(p.links[1].url, 'https://www.umassdining.com/sites/default/files/2026-10/Commonwealth%20Fall%2026%20LITE%20FARE%20Menus.pdf');
    });

    test('a link that fails the gate is dropped without hiding the ones after it', () {
      final p = parseRetailMenuHtml('<p><a href="https://evil.example/a.pdf">A</a></p><p><a href="https://umassdining.com/b.pdf">B</a></p><p><a href="mailto:x@y.z">C</a></p><p><a href="https://umassdining.com/d.pdf">D</a></p>') as RetailMenuPdf;
      expect([for (final l in p.links) l.label], ['B', 'D']);
    });

    test('a single PDF link has one link', () {
      expect((parseRetailMenuHtml(babyBerkBreakfastMenu) as RetailMenuPdf).links, hasLength(1));
    });

    test('a PDF link with no text is labelled Menu', () {
      expect((parseRetailMenuHtml('<a href="https://umassdining.com/m.pdf"></a>') as RetailMenuPdf).label, 'Menu');
    });

    test('null, empty and tag-only input are empty', () {
      for (final h in [null, '', '<p></p><p>   </p>']) {
        expect(parseRetailMenuHtml(h), isA<RetailMenuEmpty>(), reason: '$h');
      }
    });
  });
}
