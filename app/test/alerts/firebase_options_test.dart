// iOS has no GoogleService-Info.plist in the Xcode target, so its Firebase options come from Dart; Android's stay with google-services.json.
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:udine/alerts/push_firebase.dart';

void main() {
  test('iOS gets the registered iOS app in the Android app\'s project; Android leaves it to google-services.json', () {
    final ios = firebaseOptions(TargetPlatform.iOS)!;
    expect(ios.iosBundleId, 'com.udinetogether.udine');
    expect(ios.projectId, 'udine-a6996');
    expect(ios.appId, startsWith('1:409750876794:ios:'));
    expect(firebaseOptions(TargetPlatform.android), isNull);
  });
}
