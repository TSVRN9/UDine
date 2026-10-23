import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'push.dart';

/// `Messaging` on firebase_messaging. Nothing here runs until Notify me has been turned on (PushSync), so Firebase isn't even initialised
/// before then. On Android the Google Services plugin supplies the options from google-services.json; iOS has no GoogleService-Info.plist
/// in the Xcode target, so its options are here (Firebase client keys aren't secret: google-services.json is committed too).
FirebaseOptions? firebaseOptions(TargetPlatform p) => p == TargetPlatform.iOS
    ? const FirebaseOptions(
        apiKey: 'AIzaSyCrFhe4dzo4qPCdd94QCrKnSDIz1LIHF_A',
        appId: '1:409750876794:ios:ffe59328fa1c988ce841c3',
        messagingSenderId: '409750876794',
        projectId: 'udine-a6996',
        storageBucket: 'udine-a6996.firebasestorage.app',
        iosBundleId: 'com.udinetogether.udine',
      )
    : null;

class FirebaseMessagingClient implements Messaging {
  Future<FirebaseMessaging> _fm() async {
    if (Firebase.apps.isEmpty) await Firebase.initializeApp(options: firebaseOptions(defaultTargetPlatform));
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
