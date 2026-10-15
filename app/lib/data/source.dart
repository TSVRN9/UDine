import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

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

  Future<Object?> _json(Uri uri) => sendJson(client, timeout, 'GET', uri);
}

/// One JSON request, with the network failures mapped to [Unreachable] and a non-200 to [BadStatus].
Future<Object?> sendJson(http.Client client, Duration timeout, String method, Uri uri, {Map<String, String>? headers, String? body}) async =>
    jsonDecode(utf8.decode(await sendBytes(client, timeout, method, uri, headers: headers, body: body)));

/// [sendJson]'s request, answered as the raw body.
Future<Uint8List> sendBytes(http.Client client, Duration timeout, String method, Uri uri, {Map<String, String>? headers, String? body}) async {
  final http.Response res;
  try {
    final req = http.Request(method, uri)..headers.addAll(headers ?? const {});
    if (body != null) req.body = body;
    res = await http.Response.fromStream(await client.send(req).timeout(timeout));
  } on SocketException catch (e) {
    throw Unreachable(e);
  } on http.ClientException catch (e) {
    throw Unreachable(e);
  } on TimeoutException catch (e) {
    throw Unreachable(e);
  }
  if (res.statusCode != 200) throw BadStatus(uri, res.statusCode);
  return res.bodyBytes;
}
