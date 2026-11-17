import 'package:flutter/material.dart';

/// Colours taken 1:1 from the web portal's style.css ("warm paper" theme).
class C {
  static const paper = Color(0xFFF4EEE2), paper2 = Color(0xFFEBE2CF), paper3 = Color(0xFFE1D6BF);
  static const card = Color(0xFFFBF8F1), field = Color(0xFFFFFDF8);
  static const line = Color(0xFFD9CDB4), lineSoft = Color(0xFFE7DEC9), lineStrong = Color(0xFFC4B595);
  static const ink = Color(0xFF2A241C), ink2 = Color(0xFF4F463A), muted = Color(0xFF6D6354);
  static const indigo = Color(0xFF2F3B94), indigoD = Color(0xFF232D78), indigoTint = Color(0xFFE3E5F3);
  static const orange = Color(0xFFD9731F), orangeInk = Color(0xFF9C4A09), orangeTint = Color(0xFFF6E1C8);
  static const ok = Color(0xFF2B6341), okBg = Color(0xFFE2EDDE), err = Color(0xFFA02E28), errBg = Color(0xFFF5DFDB), warn = Color(0xFF80530A), warnBg = Color(0xFFF5E6C4);
  static const tones = [Color(0xFFE3E5F3), Color(0xFFF6E1C8), Color(0xFFE2EDDE), Color(0xFFF5DFDB), Color(0xFFF5E6C4), Color(0xFFE6E0F0)];
}

FontWeight _fw(int w) => w >= 700 ? FontWeight.w700 : w >= 600 ? FontWeight.w600 : w >= 500 ? FontWeight.w500 : FontWeight.w400;
TextStyle serif(double size, {int w = 600, Color color = C.ink, double? height}) => TextStyle(fontFamily: 'Fraunces', package: 'cnhs_core', fontSize: size, fontWeight: _fw(w), fontVariations: [FontVariation('wght', w.toDouble())], color: color, height: height ?? 1.2, letterSpacing: -0.1);
TextStyle sans(double size, {int w = 400, Color color = C.ink, double? height}) => TextStyle(fontFamily: 'HankenGrotesk', package: 'cnhs_core', fontSize: size, fontWeight: _fw(w), fontVariations: [FontVariation('wght', w.toDouble())], color: color, height: height ?? 1.4);
const mono = TextStyle(fontFamily: 'Consolas', fontFamilyFallback: ['Roboto Mono', 'monospace'], fontSize: 13, color: C.ink);

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: C.indigo, brightness: Brightness.light).copyWith(
      primary: C.indigo, onPrimary: Colors.white, secondary: C.orange, surface: C.card, onSurface: C.ink, error: C.err, outline: C.line);
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: C.paper,
    canvasColor: C.paper,
    fontFamily: 'packages/cnhs_core/HankenGrotesk',
    textTheme: ThemeData.light().textTheme.apply(fontFamily: 'packages/cnhs_core/HankenGrotesk', bodyColor: C.ink, displayColor: C.ink),
    dividerColor: C.line,
    splashFactory: InkRipple.splashFactory,
  );
}
