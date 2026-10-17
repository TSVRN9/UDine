import '../../core/health/health_client.dart';
import '../../core/health/health_meal.dart';

/// M2's simulated OS (`?os=ios|android`, `?health=allow|deny|revoked`): the health store a recorded route and the tests talk to.
/// [allows] is what the permission sheet answers, [status] what the OS holds now (a test sets it to stand for a revoke in system
/// settings). [records] is the store itself, one record per meal, replaced in place by a write of the same meal.
class SimulatedHealth implements HealthClient {
  SimulatedHealth({this.platform = 'android', this.allows = true, this.status = HealthAccess.denied});
  @override
  final String platform;
  bool allows;
  HealthAccess status;
  bool failWrites = false;
  final records = <String, HealthMeal>{};
  var opened = 0;

  @override
  Future<HealthAccess> access() async => status;

  @override
  Future<bool> requestWrite() async {
    if (allows && status == HealthAccess.denied) status = HealthAccess.granted;
    return status == HealthAccess.granted;
  }

  @override
  Future<List<String>?> write(HealthMeal meal) async {
    if (failWrites || status != HealthAccess.granted) return null;
    final id = 'udine-${meal.mealId}';
    records[id] = meal;
    return [id];
  }

  @override
  Future<bool> delete(List<String> ids) async {
    if (failWrites || status != HealthAccess.granted) return false;
    ids.forEach(records.remove);
    return true;
  }

  @override
  Future<void> openSettings() async => opened++;
}
