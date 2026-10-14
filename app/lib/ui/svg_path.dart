import 'dart:math' as math;
import 'package:flutter/painting.dart';

final _tok = RegExp(r'([MmLlHhVvCcSsZzAa])|(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)');

/// The SVG path subset M2's glyphs use (M L H V C S A Z, absolute and relative) as a Flutter Path.
Path svgPath(String d) {
  final t = _tok.allMatches(d).map((m) => m[1] ?? m[2]!).toList();
  final p = Path();
  var i = 0, x = 0.0, y = 0.0, sx = 0.0, sy = 0.0, cx = 0.0, cy = 0.0;
  var cmd = '';
  double n() => double.parse(t[i++]);
  bool num_() => i < t.length && RegExp(r'^[-.\d]').hasMatch(t[i]);
  while (i < t.length) {
    if (RegExp(r'^[A-Za-z]$').hasMatch(t[i])) cmd = t[i++];
    final rel = cmd == cmd.toLowerCase() && cmd.toLowerCase() != 'z';
    switch (cmd.toLowerCase()) {
      case 'm':
        do {
          final nx = n(), ny = n();
          x = rel ? x + nx : nx;
          y = rel ? y + ny : ny;
          if (cmd == 'M' || cmd == 'm') {
            p.moveTo(x, y);
            sx = x;
            sy = y;
            cmd = rel ? 'l' : 'L'; // implicit lineto after the first pair
          } else {
            p.lineTo(x, y);
          }
        } while (num_());
      case 'l':
        do {
          final nx = n(), ny = n();
          x = rel ? x + nx : nx;
          y = rel ? y + ny : ny;
          p.lineTo(x, y);
        } while (num_());
      case 'h':
        do {
          final nx = n();
          x = rel ? x + nx : nx;
          p.lineTo(x, y);
        } while (num_());
      case 'v':
        do {
          final ny = n();
          y = rel ? y + ny : ny;
          p.lineTo(x, y);
        } while (num_());
      case 'c':
        do {
          final a = n(), b = n(), c = n(), d2 = n(), e = n(), f = n();
          final x1 = rel ? x + a : a, y1 = rel ? y + b : b, x2 = rel ? x + c : c, y2 = rel ? y + d2 : d2;
          x = rel ? x + e : e;
          y = rel ? y + f : f;
          p.cubicTo(x1, y1, x2, y2, x, y);
          cx = x2;
          cy = y2;
        } while (num_());
      case 's':
        do {
          final c = n(), d2 = n(), e = n(), f = n();
          final x1 = 2 * x - cx, y1 = 2 * y - cy, x2 = rel ? x + c : c, y2 = rel ? y + d2 : d2;
          x = rel ? x + e : e;
          y = rel ? y + f : f;
          p.cubicTo(x1, y1, x2, y2, x, y);
          cx = x2;
          cy = y2;
        } while (num_());
      case 'a':
        do {
          final rx = n(), ry = n(), rot = n(), large = n(), sweep = n(), nx = n(), ny = n();
          x = rel ? x + nx : nx;
          y = rel ? y + ny : ny;
          p.arcToPoint(Offset(x, y), radius: Radius.elliptical(rx, ry), rotation: rot * math.pi / 180, largeArc: large != 0, clockwise: sweep != 0);
        } while (num_());
      case 'z':
        p.close();
        x = sx;
        y = sy;
      default:
        throw FormatException('path command $cmd');
    }
    if (cmd.toLowerCase() != 'c' && cmd.toLowerCase() != 's') {
      cx = x;
      cy = y;
    }
  }
  return p;
}
