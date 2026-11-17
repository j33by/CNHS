import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'api.dart';
import 'session.dart';
import 'store.dart';
import 'theme.dart';
import 'widgets.dart';

class _IdMask extends TextInputFormatter {
  final Role role; _IdMask(this.role);
  @override TextEditingValue formatEditUpdate(TextEditingValue o, TextEditingValue n) {
    if (role == Role.admin) return n;
    final d = n.text.replaceAll(RegExp(r'\D'), ''); String t;
    if (role == Role.teacher) { t = d.isEmpty ? ((n.text.isEmpty || n.text.length < o.text.length) ? '' : 'T-') : 'T-${d.length > 5 ? d.substring(0, 5) : d}'; }
    else { final x = d.length > 11 ? d.substring(0, 11) : d; t = x.length > 6 ? '${x.substring(0, 6)}-${x.substring(6)}' : x; }
    return TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length));
  }
}

class LoginPage extends StatefulWidget { const LoginPage({super.key}); @override State<LoginPage> createState() => _LoginPageState(); }
class _LoginPageState extends State<LoginPage> {
  final id = TextEditingController(), pw = TextEditingController(), server = TextEditingController(); bool busy = false, showServer = false; String? error;
  @override void initState() { super.initState(); Store.server().then((v) { if (mounted) server.text = v; }); }
  Future<void> go() async {
    final s = Scope.read(context); if (id.text.trim().isEmpty || pw.text.isEmpty) { setState(() => error = 'Enter your ID and password.'); return; }
    setState(() { busy = true; error = null; });
    try { await s.login(id.text.trim(), pw.text, server: server.text); } on ApiException catch (e) { if (mounted) setState(() => error = e.message); } finally { if (mounted) setState(() => busy = false); }
  }
  @override Widget build(BuildContext c) {
    final s = Scope.of(c), r = s.role;
    final (String tag, String heading, String lead, String label, String? hint, String? help) = switch (r) {
      Role.admin => ('Staff', 'Administrator portal', 'For authorized school personnel only.', 'Username', null, null),
      Role.teacher => ('Teacher', 'Teacher sign-in', 'Enter grades and attendance, post announcements and manage your classes.', 'Teacher ID', 'T-12345', 'Forgot your password? Ask the school administrator to reset it.'),
      Role.student => ('Student', 'Welcome back', 'Sign in with your Student ID to see your grades, attendance and school updates.', 'Student ID', '202627-12345', 'No password yet, or forgot it? Visit the school registrar.'),
    };
    final form = Container(constraints: const BoxConstraints(maxWidth: 440), padding: const EdgeInsets.all(28), child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
      Eyebrow('$tag sign-in'), const SizedBox(height: 6), Text(heading, style: serif(30)), const SizedBox(height: 8), Text(lead, style: sans(15, color: C.ink2)), const SizedBox(height: 22),
      if (s.notice != null && error == null) AlertBox(s.notice!, kind: 'warn'), if (error != null) AlertBox(error!, kind: 'err'),
      Fld(label, id, hint: hint, keyboard: r == Role.admin ? TextInputType.text : (r == Role.student ? TextInputType.number : TextInputType.text), formatters: [_IdMask(r)], onSubmit: (_) => go()),
      Fld('Password', pw, obscure: true, onSubmit: (_) => go()),
      Btn(busy ? 'Signing in...' : 'Sign in', busy ? null : go, pri: true, wide: true, icon: Icons.arrow_forward),
      if (help != null) Padding(padding: const EdgeInsets.only(top: 14), child: Text(help, style: sans(13, color: C.muted))),
      const SizedBox(height: 10),
      TextButton(onPressed: () => setState(() => showServer = !showServer), child: Text(showServer ? 'Hide server address' : 'Server address', style: sans(13, color: C.muted))),
      if (showServer) Fld('School server', server, hint: 'https://your-school.onrender.com', help: 'Only change this if the school tells you to.'),
      Row(children: [const Icon(Icons.lock_outline, size: 14, color: C.muted), const SizedBox(width: 6), Text('Every sign-in attempt is recorded.', style: sans(12.5, color: C.muted))]),
    ]));
    return Scaffold(backgroundColor: C.paper, body: SafeArea(child: isWide(c)
      ? Row(children: [Expanded(child: Container(color: C.paper2, child: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [ClipOval(child: Image.asset('assets/logo.png', package: 'cnhs_core', width: 150)), const SizedBox(height: 22), Text('Calape National', style: serif(30), textAlign: TextAlign.center), Text('High School', style: serif(30, w: 400, color: C.indigo)), const SizedBox(height: 8), Text('Calape, Bohol · Founded 1990', style: sans(14, color: C.muted))])))), Expanded(child: Center(child: SingleChildScrollView(child: form)))])
      : Center(child: SingleChildScrollView(child: Column(children: [const SizedBox(height: 16), ClipOval(child: Image.asset('assets/logo.png', package: 'cnhs_core', width: 88)), form])))));
  }
}

/// Forced after a temporary password, or opened from the account menu.
class PasswordPage extends StatefulWidget { final bool forced; const PasswordPage({super.key, this.forced = false}); @override State<PasswordPage> createState() => _PasswordPageState(); }
class _PasswordPageState extends State<PasswordPage> {
  final cur = TextEditingController(), nw = TextEditingController(), cf = TextEditingController(); bool busy = false;
  Future<void> save() async {
    final s = Scope.read(context); setState(() => busy = true);
    final r = await act(context, () => s.api.post('/auth/password', {'current': cur.text, 'new': nw.text, 'confirm': cf.text}));
    if (mounted) setState(() => busy = false);
    if (r != null) { cur.clear(); nw.clear(); cf.clear(); s.passwordChanged(); if (!widget.forced && mounted) Navigator.of(context).maybePop(); }
  }
  @override Widget build(BuildContext c) {
    final s = Scope.read(c), student = s.role == Role.student;
    final form = Panel(title: 'Change password', child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (widget.forced) const AlertBox('You are using a temporary password. Set your own password to continue.', kind: 'err'),
      Fld('Current password', cur, obscure: true), Fld('New password', nw, obscure: true, help: student ? 'At least 10 characters, with letters and numbers. No names, ID numbers or common words.' : '12+ characters with upper and lower case, a number and a symbol.'), Fld('Confirm new password', cf, obscure: true, onSubmit: (_) => save()),
      Btn(busy ? 'Saving...' : 'Change password', busy ? null : save, pri: true)]));
    if (!widget.forced) return PageBody([const Back('Back'), ConstrainedBox(constraints: const BoxConstraints(maxWidth: 520), child: form)]);
    return Scaffold(backgroundColor: C.paper, appBar: AppBar(backgroundColor: C.paper, title: Text('Set your password', style: serif(20)), actions: [TextButton(onPressed: s.logout, child: const Text('Sign out'))]), body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(20), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 520), child: form))));
  }
}
