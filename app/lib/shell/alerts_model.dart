import 'package:flutter/foundation.dart';

import '../alerts/alerts_os.dart';
import '../core/store/store.dart';

/// Notify me (M2 R11 §2): the wish (stored on the device) and what the OS says of it. Loaded before the first frame, so the row never
/// pops in; re-read when the app returns and when You or Favorites is shown, which is how a permission revoked in system settings is found.
class AlertsModel extends ChangeNotifier {
  AlertsModel(this._store, this._os, {bool on = false, bool allowed = true, bool restricted = false}) : _on = on, _allowed = allowed, _restricted = restricted; // ignore: prefer_initializing_formals
  final UdineStore? _store;
  final AlertsOs _os;
  bool _on, _allowed, _restricted;
  bool _refused = false; // the OS said no to the last tap (the wish stays as it was)

  static Future<AlertsModel> load(UdineStore? store, AlertsOs os) async {
    final on = await store?.alertsOn() ?? false, allowed = await os.allowed();
    return AlertsModel(store, os, on: on, allowed: allowed, restricted: on && allowed && await os.backgroundRestricted());
  }

  /// The check is filled: wished for and allowed.
  bool get checked => _on && _allowed;

  /// Not allowed, and the user has asked (a refused tap, or a wish the OS has since revoked).
  bool get denied => !_allowed && (_on || _refused);

  /// Allowed, but the OS won't run UDine in the background: the check stays on and the row says why.
  bool get backgroundOff => checked && _restricted;

  Future<void> refresh() async {
    final allowed = await _os.allowed(), restricted = _on && allowed && await _os.backgroundRestricted();
    if (allowed == _allowed && restricted == _restricted) return;
    _allowed = allowed;
    _restricted = restricted;
    if (allowed) _refused = false;
    notifyListeners();
  }

  Future<void> toggle() async {
    if (checked) return _set(false);
    final ok = await _os.request();
    _allowed = ok;
    _refused = !ok;
    _restricted = ok && await _os.backgroundRestricted();
    if (ok) return _set(true);
    notifyListeners();
  }

  Future<void> _set(bool on) async {
    _on = on;
    notifyListeners();
    await _store?.setAlertsOn(on);
    await _os.schedule(on);
  }

  Future<void> openSettings() => _os.openSettings(denied ? AlertsSettings.notifications : AlertsSettings.background);
}
