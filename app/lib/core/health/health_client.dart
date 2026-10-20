import 'dart:io' show Platform;

import 'package:flutter/services.dart';

import 'health_meal.dart';

enum HealthAccess { granted, denied, notInstalled, unsupported }

/// The device's health store, write only: there is no read here and none on the native side.
abstract class HealthClient {
  String get platform;
  Future<HealthAccess> access();

  /// Raises the OS permission sheet; true when write is allowed afterwards.
  Future<bool> requestWrite();

  /// Writes [meal] as one record, replacing the one an earlier write of the same meal left (the client id is the meal's, on both
  /// platforms). Returns the ids to delete it by, or null when nothing was written.
  Future<List<String>?> write(HealthMeal meal);

  Future<bool> delete(List<String> ids);

  /// Health Connect's permission page for UDine (Android) or UDine's page in Settings (iOS).
  Future<void> openSettings();
}

/// Native side: `MainActivity.kt` (Health Connect, clientRecordId upsert) and `AppDelegate.swift` (HealthKit food correlation).
/// The health pub package was passed over: its iOS writeMeal takes no client id and returns no ids, and it has no iOS delete by id.
class ChannelHealthClient implements HealthClient {
  ChannelHealthClient({MethodChannel? channel, String? platform})
      : _c = channel ?? const MethodChannel('udine/health'),
        platform = platform ?? (Platform.isIOS ? 'ios' : 'android');
  final MethodChannel _c;

  @override
  final String platform;

  @override
  Future<HealthAccess> access() async {
    final r = await _c.invokeMethod<String>('access', {'permissions': kHealthWritePermissions[platform]});
    return HealthAccess.values.asNameMap()[r] ?? HealthAccess.unsupported;
  }

  @override
  Future<bool> requestWrite() async => await _c.invokeMethod<bool>('requestWrite', {'permissions': kHealthWritePermissions[platform]}) ?? false;

  @override
  Future<List<String>?> write(HealthMeal meal) async {
    final r = await _c.invokeListMethod<String>('write', {
      'clientId': 'udine-${meal.mealId}',
      'name': meal.name,
      'startMs': meal.start.millisecondsSinceEpoch,
      'endMs': meal.end.millisecondsSinceEpoch,
      'zoneOffsetSeconds': meal.start.timeZoneOffset.inSeconds,
      'fields': meal.fieldsFor(platform),
    });
    return r;
  }

  @override
  Future<bool> delete(List<String> ids) async => await _c.invokeMethod<bool>('delete', {'ids': ids}) ?? false;

  @override
  Future<void> openSettings() => _c.invokeMethod<void>('openSettings');
}
