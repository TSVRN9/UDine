import 'dart:convert';

import 'package:http/http.dart' as http;

import 'source.dart';

/// The same public values mobile ships (mobile/eas.json). The publishable key is the anon role's by design; override
/// with `--dart-define=SUPABASE_URL=... --dart-define=SUPABASE_PUBLISHABLE_KEY=...`. Nothing else secret belongs here.
const supabaseUrl = String.fromEnvironment('SUPABASE_URL', defaultValue: 'https://ubogyqskqzvkcqboqbhw.supabase.co');
const supabasePublishableKey = String.fromEnvironment(
  'SUPABASE_PUBLISHABLE_KEY',
  defaultValue: 'sb_publishable_sNs-0ho2fQDRiVR340N5MA_R25HyvI4',
);

/// MUST match supabase/config.toml's max_rows: PostgREST silently drops rows past it, so a short page is the only end signal.
const dishPageSize = 1000;

/// Two anonymous PostgREST calls over plain http: `dishes` (shared/src/dishes.ts) and `rpc/occupancy_typical`.
class SupabaseSource {
  SupabaseSource(this.client, {this.url = supabaseUrl, this.key = supabasePublishableKey, this.timeout = const Duration(seconds: 15)});
  final http.Client client;
  final String url, key;
  final Duration timeout;

  Map<String, String> get _headers => {'apikey': key, 'Content-Type': 'application/json'};

  /// One page of dish rows ordered by dish_name (a total order to page against), newer than [updatedSince] when given.
  Future<List<Map<String, dynamic>>> dishPage(int offset, {String? updatedSince}) async {
    final uri = Uri.parse('$url/rest/v1/dishes').replace(queryParameters: {
      'select': 'dish_name,nutrition,allergens,diet_tags,updated_at',
      'order': 'dish_name',
      'limit': '$dishPageSize',
      'offset': '$offset',
      'updated_at': ?(updatedSince == null ? null : 'gt.$updatedSince'),
    });
    final rows = await sendJson(client, timeout, 'GET', uri, headers: _headers) as List;
    return [for (final r in rows) r as Map<String, dynamic>];
  }

  /// Raw `occupancy_typical` rows for one location and Postgres weekday (Sunday = 0).
  Future<List<dynamic>> occupancyTypical(int locationId, int dow) async =>
      await sendJson(
            client,
            timeout,
            'POST',
            Uri.parse('$url/rest/v1/rpc/occupancy_typical'),
            headers: _headers,
            body: jsonEncode({'p_location_id': locationId, 'p_dow': dow}),
          )
          as List;
}
