import 'package:udine/alerts/alerts_os.dart';

/// The OS as a test sets it: what it will answer, and what the app asked of it.
class FakeAlertsOs implements AlertsOs {
  FakeAlertsOs({this.permitted = false, this.willAllow = true});
  bool permitted, willAllow;
  int requests = 0;
  int opened = 0;

  @override
  Future<bool> allowed() async => permitted;
  @override
  Future<bool> request() async {
    requests++;
    return permitted = willAllow; // a blocked app answers false at once, with no sheet
  }

  @override
  Future<void> openSettings() async => opened++;
}
