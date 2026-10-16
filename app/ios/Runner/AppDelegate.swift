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

/// Apple Health, write only: one HKCorrelation (food) per meal holding one sample per nutrient. HealthKit objects are immutable, so an edit
/// deletes the ids the last write returned and saves anew. The ids are the correlation's and its samples' UUIDs. Nothing is ever read
/// back except by UUID, to find an object to delete.
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

  static func types(_ call: FlutterMethodCall) -> Set<HKSampleType> {
    let ids = (call.arguments as? [String: Any])?["permissions"] as? [String] ?? []
    return Set(ids.compactMap { HKObjectType.quantityType(forIdentifier: HKQuantityTypeIdentifier(rawValue: $0)) })
  }

  static func register(_ messenger: FlutterBinaryMessenger) {
    FlutterMethodChannel(name: "udine/health", binaryMessenger: messenger).setMethodCallHandler { call, result in
      let args = call.arguments as? [String: Any] ?? [:]
      guard HKHealthStore.isHealthDataAvailable() else {
        result(call.method == "access" ? "unsupported" : (call.method == "write" ? nil : false))
        return
      }
      switch call.method {
      case "access":
        // Write status is readable for share types: denied when any is.
        let denied = types(call).contains { store.authorizationStatus(for: $0) != .sharingAuthorized }
        result(denied ? "denied" : "granted")
      case "requestWrite":
        store.requestAuthorization(toShare: types(call), read: nil) { _, _ in
          DispatchQueue.main.async { result(!types(call).contains { store.authorizationStatus(for: $0) != .sharingAuthorized }) }
        }
      case "write":
        delete(args["replacing"] as? [String] ?? []) { _ in
          let fields = args["fields"] as? [String: Double] ?? [:]
          let start = Date(timeIntervalSince1970: (args["startMs"] as? Double ?? 0) / 1000)
          let end = Date(timeIntervalSince1970: (args["endMs"] as? Double ?? 0) / 1000)
          let meta: [String: Any] = [HKMetadataKeyFoodType: args["name"] as? String ?? "", HKMetadataKeyWasUserEntered: true]
          var samples = Set<HKSample>()
          for (k, v) in fields {
            guard let (id, unit) = map[k], let t = HKQuantityType.quantityType(forIdentifier: id) else { continue }
            samples.insert(HKQuantitySample(type: t, quantity: HKQuantity(unit: unit, doubleValue: v), start: start, end: end, metadata: meta))
          }
          let meal = HKCorrelation(type: HKCorrelationType(.food), start: start, end: end, objects: samples, metadata: meta)
          store.save(meal) { ok, _ in
            DispatchQueue.main.async {
              result(ok ? ([meal.uuid.uuidString] + samples.map { $0.uuid.uuidString }) : nil)
            }
          }
        }
      case "delete":
        delete(args["ids"] as? [String] ?? []) { ok in DispatchQueue.main.async { result(ok) } }
      default:
        result(FlutterMethodNotImplemented)
      }
    }
  }

  /// Deletes every object with one of [ids] that this app saved (the store only returns and deletes its own); an id already gone is fine.
  static func delete(_ ids: [String], _ done: @escaping (Bool) -> Void) {
    let uuids = Set(ids.compactMap { UUID(uuidString: $0) })
    if uuids.isEmpty { done(true); return }
    let pred = HKQuery.predicateForObjects(with: uuids)
    let types: [HKSampleType] = [HKCorrelationType(.food)] + map.values.compactMap { HKQuantityType.quantityType(forIdentifier: $0.0) }
    var objs: [HKObject] = []
    let lock = NSLock()
    let group = DispatchGroup()
    for t in types {
      group.enter()
      store.execute(HKSampleQuery(sampleType: t, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, found, _ in
        lock.lock(); objs += found ?? []; lock.unlock()
        group.leave()
      })
    }
    group.notify(queue: .main) {
      if objs.isEmpty { done(true); return }
      store.delete(objs) { ok, _ in done(ok) }
    }
  }
}
