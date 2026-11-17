import 'package:flutter/material.dart';
import 'auth_pages.dart';
import 'background.dart';
import 'session.dart';
import 'store.dart';
import 'theme.dart';

/// Starts an app: signs the saved session back in, then shows sign-in, the forced password page, or the app itself.
Future<void> runCnhsApp({required Role role, required String title, required Widget Function(BuildContext) home}) async {
  WidgetsFlutterBinding.ensureInitialized();
  await Background.configure();
  final session = Session(role, await Store.server());
  session.restore();
  runApp(Scope(session: session, child: MaterialApp(title: title, debugShowCheckedModeBanner: false, theme: buildTheme(), home: _Gate(home))));
}
class _Gate extends StatelessWidget {
  final Widget Function(BuildContext) home; const _Gate(this.home);
  @override Widget build(BuildContext c) {
    final s = Scope.of(c);
    if (s.booting) return const Scaffold(backgroundColor: C.paper, body: Center(child: CircularProgressIndicator(color: C.indigo)));
    if (!s.signedIn) return const LoginPage();
    if (s.mustChange) return const PasswordPage(forced: true);
    return home(c);
  }
}
