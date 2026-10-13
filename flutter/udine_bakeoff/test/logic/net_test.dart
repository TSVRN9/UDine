// Task 13's contract (RN Task 8, `logic/net.ts` and `fixtureAsync.test.ts`), in Dart: M2's `menuState` rules and the per-mode fixture load.
import 'package:flutter_test/flutter_test.dart';
import 'package:udine_bakeoff/logic/net.dart';
import 'package:udine_bakeoff/state/net.dart';
import 'package:udine_bakeoff/theme/tokens.dart';
import 'support.dart';

void main() {
  test('parseNet: the three names, anything else is ok', () {
    expect([for (final s in ['slow', 'offline', 'fail', '', 'x', null]) parseNet(s)], [NetMode.slow, NetMode.offline, NetMode.fail, NetMode.ok, NetMode.ok, NetMode.ok]);
  });

  group('menuState (M2): offline keeps today and tomorrow, failed knows nothing, slow loads each place and day once', () {
    test('ok is ok', () => expect(menuState(NetMode.ok, {}, 'W|0', 0), MenuState.ok));
    test('fail is fail on every day', () => expect([for (final d in [0, 1, 5]) menuState(NetMode.fail, {}, 'W|$d', d)], everyElement(MenuState.fail)));
    test('offline: day 0 and 1 are saved, later days are not', () => expect([for (final d in [0, 1, 2, 9]) menuState(NetMode.offline, {}, 'W|$d', d)], [MenuState.ok, MenuState.ok, MenuState.offline, MenuState.offline]));
    test('slow: loading until that place and day has arrived', () {
      expect(menuState(NetMode.slow, {}, 'W|0', 0), MenuState.loading);
      expect(menuState(NetMode.slow, {'W|0'}, 'W|0', 0), MenuState.ok);
      expect(menuState(NetMode.slow, {'W|0'}, 'F|0', 0), MenuState.loading);
      expect(menuState(NetMode.slow, {'W|0'}, 'W|1', 1), MenuState.loading);
    });
  });

  // M2 `SLOW = 1600` (src.html:1204). tool/m2.json is patched to it until RN's design-tokens/m2.json (still 1500 on origin/bakeoff/rn) is fixed; the next
  // tool/sync_fixture.sh then restores 1500 and this goes red, which is the reminder.
  test('the slow load is M2\'s 1600 ms', () => expect(M2Motion.netSlow, 1600));

  group('loadFixture by mode', () {
    test('ok resolves at once with the fixture', () async {
      expect(await loadFixture(fx, NetMode.ok), fx);
    });
    test('slow resolves only after the slow delay', () async {
      var done = false;
      final f = loadFixture(fx, NetMode.slow, slow: const Duration(milliseconds: 50)).then((_) => done = true);
      await Future<void>.delayed(const Duration(milliseconds: 20));
      expect(done, isFalse);
      await f;
      expect(done, isTrue);
    });
    test('offline resolves with the saved copy', () async => expect(await loadFixture(fx, NetMode.offline), fx));
    test('fail rejects with an error the retry path can catch, and retrying in ok mode resolves', () async {
      await expectLater(loadFixture(fx, NetMode.fail), throwsA(isA<NetFailure>()));
      expect(await loadFixture(fx, NetMode.ok), fx);
    });
  });

  group('the Net store', () {
    test('slow: Halls\' hours and busy are unknown until the load lands; a menu starts loading when first asked for', () async {
      final n = Net(fx, mode: NetMode.slow, slow: const Duration(milliseconds: 30));
      expect((n.hoursKnown, n.liveKnown), (false, false));
      expect(n.menuState('W', 0), MenuState.loading);
      n.request('W|0');
      await Future<void>.delayed(const Duration(milliseconds: 60));
      expect((n.hoursKnown, n.liveKnown), (true, true));
      expect(n.menuState('W', 0), MenuState.ok);
      expect(n.menuState('W', 1), MenuState.loading);
    });
    test('offline keeps hours (cached for the day) and has no busy; failed has neither', () {
      final o = Net(fx, mode: NetMode.offline), f = Net(fx, mode: NetMode.fail);
      expect((o.hoursKnown, o.liveKnown), (true, false));
      expect((f.hoursKnown, f.liveKnown), (false, false));
    });
    test('hold: a slow load never arrives (a test seam for stills)', () async {
      final n = Net(fx, mode: NetMode.slow, slow: const Duration(milliseconds: 10), hold: true);
      n.request('W|0');
      await Future<void>.delayed(const Duration(milliseconds: 40));
      expect((n.hoursKnown, n.menuState('W', 0)), (false, MenuState.loading));
    });
    test('retry from a failure: the fetch now succeeds, so every screen leaves its failure at once', () async {
      final n = Net(fx, mode: NetMode.fail);
      var told = 0;
      n.addListener(() => told++);
      await n.retry();
      expect((n.mode, n.hoursKnown, n.liveKnown, n.menuState('W', 0)), (NetMode.ok, true, true, MenuState.ok));
      expect(told, greaterThan(0));
    });
  });
}
