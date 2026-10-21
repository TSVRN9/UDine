import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'push.dart';

/// `Messaging` on firebase_messaging. Nothing here runs until Notify me has been turned on (PushSync), so Firebase isn't even initialised
/// before then; the Google Services plugin supplies the options from google-services.json.
class FirebaseMessagingClient implements Messaging {
  Future<FirebaseMessaging> _fm() async {
    if (Firebase.apps.isEmpty) await Firebase.initializeApp();
    return FirebaseMessaging.instance;
  }

  @override
  Future<void> setAutoInit(bool on) async => (await _fm()).setAutoInitEnabled(on);
  @override
  Future<void> subscribe(String topic) async => (await _fm()).subscribeToTopic(topic);
  @override
  Future<void> unsubscribe(String topic) async => (await _fm()).unsubscribeFromTopic(topic);
  @override
  // ignore: deprecated_member_use -- the brief's call; unregister() is the Firebase Installation ID path, a different registration
  Future<void> deleteToken() async => (await _fm()).deleteToken();

  @override
  Future<PushNotice?> initialMessage() async => _notice(await (await _fm()).getInitialMessage());
  @override
  Stream<PushNotice> get onOpened => FirebaseMessaging.onMessageOpenedApp.map(_notice).where((n) => n != null).cast();
  @override
  Stream<PushNotice> get onForeground => FirebaseMessaging.onMessage.map(_notice).where((n) => n != null).cast();

  static PushNotice? _notice(RemoteMessage? m) {
    final n = m?.notification;
    if (m == null || n == null) return null;
    return PushNotice(title: n.title ?? '', body: n.body ?? '', tag: n.android?.tag ?? m.messageId ?? '');
  }
}
