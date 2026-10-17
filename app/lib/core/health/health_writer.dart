import '../store/store.dart';
import 'health_client.dart';
import 'health_meal.dart';

/// Keeps the ids of what was written in health_writes, so an edit rewrites its record and a delete deletes it without reading Health.
/// Whether to write at all (the You row, tracking on, permission granted) is the caller's call.
class HealthWriter {
  HealthWriter(this._store, this._client);
  final UdineStore _store;
  final HealthClient _client;

  Future<bool> write(HealthMeal m) async {
    final ids = await _client.write(m);
    if (ids == null) return false;
    await _store.setHealthIds(m.mealId, _client.platform, ids, m.signature(_client.platform));
    return true;
  }

  Future<bool> delete(String mealId) async {
    final ids = await _store.healthIds(mealId, _client.platform);
    if (ids.isNotEmpty && !await _client.delete(ids)) return false;
    await _store.removeHealthIds(mealId, _client.platform);
    return true;
  }
}
