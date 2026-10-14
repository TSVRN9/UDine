import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

/// No route to the server (airplane mode, no signal, timeout). Anything else that goes wrong is a plain failure.
class Unreachable implements Exception {
  const Unreachable(this.cause);
  final Object cause;
  @override
  String toString() => 'Unreachable($cause)';
}

class BadStatus implements Exception {
  const BadStatus(this.uri, this.status);
  final Uri uri;
  final int status;
  @override
  String toString() => 'BadStatus($status $uri)';
}

/// UMass Dining's public feeds, straight from umassdining.com. [client] is injected so tests use a fake.
class UmassSource {
  UmassSource(this.client, {this.timeout = const Duration(seconds: 15)});
  final http.Client client;
  final Duration timeout;

  static const _host = 'www.umassdining.com';

  /// `date` is YYYY-MM-DD; the feed wants MM/DD/YYYY.
  Future<Object?> menu(int tid, String date) {
    final [y, m, d] = date.split('-');
    return _json(Uri.https(_host, 'foodpro-menu-ajax', {'tid': '$tid', 'date': '$m/$d/$y'}));
  }

  Future<Object?> infoV2() => _json(Uri.https(_host, 'uapp/get_infov2'));

  Future<Object?> events() => _json(Uri.https(_host, 'uapp/get_beacons_events'));

  Future<Object?> _json(Uri uri) async {
    final http.Response res;
    try {
      res = await client.get(uri).timeout(timeout);
    } on SocketException catch (e) {
      throw Unreachable(e);
    } on http.ClientException catch (e) {
      throw Unreachable(e);
    } on TimeoutException catch (e) {
      throw Unreachable(e);
    }
    if (res.statusCode != 200) throw BadStatus(uri, res.statusCode);
    return jsonDecode(utf8.decode(res.bodyBytes));
  }
}
