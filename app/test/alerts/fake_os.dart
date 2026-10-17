import 'package:udine/alerts/alerts_os.dart';

/// The OS as a test sets it: what it will answer, and what the app asked of it.
class FakeAlertsOs implements AlertsOs {
  FakeAlertsOs({this.permitted = false, this.willAllow = true, this.restricted = false});
  bool permitted, willAllow, restricted;
  int requests = 0;
  final scheduled = <bool>[];
  final opened = <AlertsSettings>[];

  @override
  Future<bool> allowed() async => permitted;
  @override
  Future<bool> request() async {
    requests++;
    return permitted = willAllow; // a blocked app answers false at once, with no sheet
  }

  @override
  Future<bool> backgroundRestricted() async => restricted;
  @override
  Future<void> openSettings(AlertsSettings page) async => opened.add(page);
  @override
  Future<void> schedule(bool on) async => scheduled.add(on);
}
