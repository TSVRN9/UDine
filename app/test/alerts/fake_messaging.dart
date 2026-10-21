import 'dart:async';

import 'package:udine/alerts/push.dart';

/// FCM as a test sets it: records the calls, and lets the test deliver a launching message, a backgrounded tap and a foreground arrival.
class FakeMessaging implements Messaging {
  final calls = <String>[];
  Object? failWith;
  String? failOnly; // a call name ('subscribe', 'unsubscribe', ...): only that call throws
  final opened = StreamController<PushNotice>.broadcast(), foreground = StreamController<PushNotice>.broadcast();
  PushNotice? initial;
  bool initialFails = false;

  Future<void> _do(String c) async {
    if (failWith != null && (failOnly == null || c.startsWith(failOnly!))) throw failWith!;
    calls.add(c);
  }

  @override
  Future<void> setAutoInit(bool on) => _do('autoInit:$on');
  @override
  Future<void> subscribe(String topic) => _do('sub:$topic');
  @override
  Future<void> unsubscribe(String topic) => _do('unsub:$topic');
  @override
  Future<void> deleteToken() => _do('deleteToken');
  @override
  Future<PushNotice?> initialMessage() async => initialFails ? throw StateError('no play services') : initial;
  @override
  Stream<PushNotice> get onOpened => opened.stream;
  @override
  Stream<PushNotice> get onForeground => foreground.stream;
}
