import 'package:flutter/widgets.dart';

import '../core/store/store.dart';
import '../data/flyer.dart';
import '../data/pdf_pages.dart';
import '../data/repository.dart';
import '../motion/routes.dart';
import 'plate_model.dart';
import 'prefs.dart';

/// What every screen under the shell reads: the repository (live or recorded), the device store, the preferences and which band a
/// card is open from. The members are the notifiers; the scope itself never changes.
class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.repo, required this.store, required this.prefs, required this.hider, required this.plate, this.pdfOpen = pdfxOpen, this.shareFlyer = shareFlyerFile, required super.child});
  final Repository repo;
  /// null when a newer build owns the database: menus only, nothing is written
  final UdineStore? store;
  final AppPrefs prefs;
  final BandHider hider;
  /// the plates being built: in memory until Log
  final PlateModel plate;
  /// how a café's menu PDF is drawn (tests hand in synthetic pages)
  final PdfOpen pdfOpen;
  /// how an event's flyer is shared (tests hand in a recorder)
  final FlyerShare shareFlyer;

  /// a newer build owns the database: nothing is written, so nothing that records (a custom food) is offered
  bool get menusOnly => store == null;

  static AppScope of(BuildContext context) => context.getInheritedWidgetOfExactType<AppScope>()!;

  @override
  bool updateShouldNotify(AppScope old) => false;
}
