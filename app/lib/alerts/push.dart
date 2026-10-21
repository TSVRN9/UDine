import 'dart:async';

import 'package:flutter/foundation.dart' show debugPrint;

import '../core/m2/board.dart' show isAlways;
import '../core/dish_topic.dart';
import '../core/store/store.dart';
import '../core/types.dart';
import 'alerts.dart' show showPush, tapAlert;

/// A favourite-alert push as the app sees it: the server's notification (title = dish, body = the where sentence) and its `data.route`.
class PushNotice {
  const PushNotice({required this.title, required this.body, required this.tag, required this.route});
  final String title, body, tag, route;
}

/// FCM as Notify me needs it. `FirebaseMessagingClient` (push_firebase.dart) is the device's; a test hands in a recording fake.
abstract interface class Messaging {
  Future<void> setAutoInit(bool on);
  Future<void> subscribe(String topic);
  Future<void> unsubscribe(String topic);
  Future<void> deleteToken();

  /// The push that launched the app from killed, once.
  Future<PushNotice?> initialMessage();

  /// A tap on a push while the app was backgrounded.
  Stream<PushNotice> get onOpened;

  /// A push that arrived with the app in the foreground (FCM doesn't display those).
  Stream<PushNotice> get onForeground;
}

/// FCM allows 2000 topics per app instance.
const maxTopics = 2000;

/// Keeps the install's topic follows equal to the favourite dishes while Notify me is on, and to nothing (token deleted) while it is off.
/// The applied set lives on the device: topic follows can't be read back from FCM, and a failed call is retried by the next [sync].
/// No call reaches Google until [sync] has been asked to turn it on once.
class PushSync {
  PushSync(this._store, this._m, {Future<void> Function(PushNotice)? show}) : _show = show ?? ((n) => showPush(n));
  final UdineStore _store;
  final Messaging _m;
  final Future<void> Function(PushNotice) _show;
  Future<void> _last = Future.value();
  bool _wired = false;

  /// [on]: Notify me is on and the OS permits notifications. Syncs run one after another.
  Future<void> sync({required bool on}) => _last = _last.then((_) => _run(on));

  Future<void> _run(bool on) async {
    try {
      final active = await _store.pushActive();
      if (!on && !active) return;
      final applied = {...await _store.pushTopics()};
      if (on) {
        final want = ({for (final f in await _store.favorites()) if (f is DishFavorite && !isAlways(f.dishName)) dishTopic(f.dishName)}.toList()..sort()).take(maxTopics).toSet();
        if (!active) {
          await _m.setAutoInit(true);
          await _store.setPushActive(true);
        }
        _wire();
        for (final t in want.difference(applied)) {
          await _m.subscribe(t);
          applied.add(t);
          await _store.setPushTopics(applied.toList());
        }
        for (final t in applied.difference(want).toList()) {
          await _m.unsubscribe(t);
          applied.remove(t);
          await _store.setPushTopics(applied.toList());
        }
      } else {
        for (final t in applied.toList()) {
          await _m.unsubscribe(t);
          applied.remove(t);
          await _store.setPushTopics(applied.toList());
        }
        await _m.deleteToken();
        await _m.setAutoInit(false); // the native flag set by setAutoInit(true) outlives the manifest's false
        await _store.setPushActive(false);
      }
    } catch (e) {
      debugPrint('push sync: $e'); // offline, or no Play services: the diff stays unapplied for the next resume
    }
  }

  /// The three tap/arrival sources, started once Notify me has been on: launch, backgrounded tap, foreground arrival.
  void _wire() {
    if (_wired) return;
    _wired = true;
    void log(Object e) => debugPrint('push: $e'); // e.g. no Play services on a relaunch
    _m.onOpened.listen((n) => tapAlert(n.route), onError: log);
    _m.onForeground.listen((n) => unawaited(_show(n).catchError((Object e) { log(e); })), onError: log);
    unawaited(_m.initialMessage().then((n) {
      if (n != null) tapAlert(n.route);
    }).catchError((Object e) { log(e); }));
  }
}
