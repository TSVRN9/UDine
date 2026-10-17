import Flutter
import HealthKit
import UIKit
import workmanager_apple

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // The favourite-alerts check (alerts.dart's alertTask); Dart schedules it, this registers the BGTaskScheduler handler.
    WorkmanagerPlugin.registerPeriodicTask(withIdentifier: "com.udinetogether.udine.favoriteAlerts", frequency: NSNumber(value: 15 * 60))
    WorkmanagerPlugin.setPluginRegistrantCallback { registry in GeneratedPluginRegistrant.register(with: registry) }
    UNUserNotificationCenter.current().delegate = self as UNUserNotificationCenterDelegate
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    HealthChannel.register(engineBridge.applicationRegistrar.messenger())
  }
}

/// Apple Health, write only: one HKCorrelation (food) per meal holding one sample per nutrient.
/// Edits and deletes use HealthKit's sync identifier, never a query (the app has share authorization only, and a query without read
/// authorization can return nothing): the correlation is "udine-<mealId>" and each sample "udine-<mealId>-<field>", all stamped with
/// HKMetadataKeySyncVersion (ms since epoch). Saving again with a higher version replaces the old object; as HealthKit's handling of a
/// correlation's replacement can't be seen from here, a write also deletes (deleteObjects, share authorization is enough) every object of
/// those identifiers with a lower version once the save has succeeded. A failed save therefore never costs the old record. The ids
/// returned (and kept in health_writes) are the sync identifiers.
final class HealthChannel {
  static let store = HKHealthStore()
  // field key -> (type, unit)
  static let map: [String: (HKQuantityTypeIdentifier, HKUnit)] = [
    "energyKcal": (.dietaryEnergyConsumed, .kilocalorie()),
    "fatG": (.dietaryFatTotal, .gram()),
    "satFatG": (.dietaryFatSaturated, .gram()),
    "cholesterolMg": (.dietaryCholesterol, .gramUnit(with: .milli)),
    "sodiumMg": (.dietarySodium, .gramUnit(with: .milli)),
    "carbG": (.dietaryCarbohydrates, .gram()),
    "fiberG": (.dietaryFiber, .gram()),
    "sugarG": (.dietarySugar, .gram()),
    "proteinG": (.dietaryProtein, .gram()),
  ]

  static var foodType: HKCorrelationType { HKCorrelationType.correlationType(forIdentifier: .food)! }

  static func types(_ call: FlutterMethodCall) -> Set<HKSampleType> {
    let ids = (call.arguments as? [String: Any])?["permissions"] as? [String] ?? []
    return Set(ids.compactMap { HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: $0)) })
  }

  static func allWritable(_ call: FlutterMethodCall) -> Bool {
    !types(call).contains { store.authorizationStatus(for: $0) != .sharingAuthorized }
  }

  static func register(_ messenger: FlutterBinaryMessenger) {
    FlutterMethodChannel(name: "udine/health", binaryMessenger: messenger).setMethodCallHandler { call, result in
      let args = call.arguments as? [String: Any] ?? [:]
      if call.method == "openSettings" {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        result(nil)
        return
      }
      guard HKHealthStore.isHealthDataAvailable() else {
        switch call.method {
        case "access": result("unsupported")
        case "write": result(nil)
        default: result(false)
        }
        return
      }
      switch call.method {
      case "access":
        result(allWritable(call) ? "granted" : "denied")
      case "requestWrite":
        store.requestAuthorization(toShare: types(call), read: nil) { _, _ in
          DispatchQueue.main.async { result(allWritable(call)) }
        }
      case "write":
        let id = args["clientId"] as? String ?? ""
        let fields = args["fields"] as? [String: Double] ?? [:]
        let start = Date(timeIntervalSince1970: (args["startMs"] as? Double ?? 0) / 1000)
        let end = Date(timeIntervalSince1970: (args["endMs"] as? Double ?? 0) / 1000)
        let version = Int(Date().timeIntervalSince1970 * 1000)
        func meta(_ syncId: String) -> [String: Any] {
          [HKMetadataKeyFoodType: args["name"] as? String ?? "", HKMetadataKeyWasUserEntered: true,
           HKMetadataKeySyncIdentifier: syncId, HKMetadataKeySyncVersion: version]
        }
        var samples = Set<HKSample>()
        var ids = [id]
        for (k, v) in fields.sorted(by: { $0.key < $1.key }) {
          guard let (qid, unit) = map[k], let t = HKQuantityType.quantityType(forIdentifier: qid) else { continue }
          samples.insert(HKQuantitySample(type: t, quantity: HKQuantity(unit: unit, doubleValue: v), start: start, end: end, metadata: meta("\(id)-\(k)")))
          ids.append("\(id)-\(k)")
        }
        let meal = HKCorrelation(type: foodType, start: start, end: end, objects: samples, metadata: meta(id))
        store.save(meal) { ok, _ in
          guard ok else { DispatchQueue.main.async { result(nil) }; return }
          // Only now are the older versions of the same identifiers removed.
          purge(ids, olderThan: version) { purged in DispatchQueue.main.async { result(purged ? ids : nil) } }
        }
      case "delete":
        purge(args["ids"] as? [String] ?? [], olderThan: nil) { ok in DispatchQueue.main.async { result(ok) } }
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  /// deleteObjects by predicate (no read authorization needed) for the correlation and every nutrient type: objects whose sync identifier is
  /// in [ids], and, when [olderThan] is given, whose sync version is lower. Nothing matching is success.
  static func purge(_ ids: [String], olderThan: Int?, _ done: @escaping (Bool) -> Void) {
    if ids.isEmpty { done(true); return }
    var pred = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: ids)
    if let v = olderThan {
      let lower = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncVersion, operatorType: .lessThan, value: v)
      pred = NSCompoundPredicate(andPredicateWithSubpredicates: [pred, lower])
    }
    let types: [HKObjectType] = [foodType] + map.values.compactMap { HKQuantityType.quantityType(forIdentifier: $0.0) }
    var allOk = true
    let lock = NSLock()
    let group = DispatchGroup()
    for t in types {
      group.enter()
      store.deleteObjects(of: t, predicate: pred) { ok, _, _ in
        lock.lock(); if !ok { allOk = false }; lock.unlock()
        group.leave()
      }
    }
    group.notify(queue: .main) { done(allOk) }
  }
}
