import 'dart:async';
import 'package:flutter/material.dart';
import 'api.dart';
import 'notifications_page.dart';
import 'session.dart';
import 'theme.dart';
import 'widgets.dart';

class PageDef { final String label; final WidgetBuilder build; const PageDef(this.label, this.build); }
class Hub { final String label; final IconData icon; final List<PageDef> pages; const Hub(this.label, this.icon, this.pages); }

/// Same layout as the web portal: side menu of "hubs", tabs for the pages inside a hub, avatar + sign-out at the top.
/// Wide screens (Windows, tablets) get the fixed side menu; phones get a drawer.
class AppShell extends StatefulWidget {
  final String portalTitle, brand1, brand2, who, roleLine, footLabel, footValue; final List<Hub> hubs;
  const AppShell({super.key, required this.portalTitle, required this.brand1, required this.brand2, required this.who, required this.roleLine, required this.footLabel, required this.footValue, required this.hubs});
  @override State<AppShell> createState() => _AppShellState();
}
class _AppShellState extends State<AppShell> {
  int h = 0, p = 0; final nav = GlobalKey<NavigatorState>(); final scaffold = GlobalKey<ScaffoldState>();
  DateTime _last = DateTime.now(); Timer? _idle; bool warn = false; StreamSubscription? _n;
  static const _idleLimit = Duration(minutes: 20), _warnAt = Duration(minutes: 18);
  @override void initState() {
    super.initState();
    final s = Scope.read(context);
    if (s.desktopDevice) _idle = Timer.periodic(const Duration(seconds: 20), (_) { final d = DateTime.now().difference(_last); if (d > _idleLimit) { s.logout(); } else if (d > _warnAt != warn) { setState(() => warn = d > _warnAt); } });
    // In-app banner for live notifications (Android system notification comes from the background service).
    _n = s.rt.notifications.listen((n) { if (mounted) toast(context, '${n.title}${n.body.isEmpty ? '' : ' - ${n.body}'}'); });
  }
  @override void dispose() { _idle?.cancel(); _n?.cancel(); super.dispose(); }
  void _act() { _last = DateTime.now(); if (warn) setState(() => warn = false); Scope.read(context).touch(); }
  void go(int hub, int page) { setState(() { h = hub; p = page; }); nav.currentState?.pushAndRemoveUntil(MaterialPageRoute(builder: (c) => _page(c), settings: const RouteSettings(name: '/')), (r) => false); if (scaffold.currentState?.isDrawerOpen ?? false) Navigator.of(context).pop(); }
  Widget _page(BuildContext c) => widget.hubs[h].pages[p].build(c);

  Widget _side(bool drawer) => Container(width: 248, color: C.paper2, child: SafeArea(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
    Container(padding: const EdgeInsets.fromLTRB(18, 18, 18, 16), decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: C.line))), child: Row(children: [
      ClipOval(child: Image.asset('assets/logo.png', package: 'cnhs_core', width: 46, height: 46)), const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(widget.brand1, style: serif(16, w: 650)), Text(widget.brand2, style: sans(12.5, color: C.muted))]))])),
    Expanded(child: ListView(padding: const EdgeInsets.all(10), children: [for (var i = 0; i < widget.hubs.length; i++) _hubTile(i)])),
    Container(padding: const EdgeInsets.all(16), decoration: const BoxDecoration(border: Border(top: BorderSide(color: C.line))), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(widget.footLabel, style: sans(12, color: C.muted)), Text(widget.footValue, style: sans(14.5, w: 700))])),
  ])));
  Widget _hubTile(int i) { final hub = widget.hubs[i], on = i == h; return Padding(padding: const EdgeInsets.only(bottom: 2), child: Material(color: on ? C.card : Colors.transparent, borderRadius: BorderRadius.circular(8), child: InkWell(borderRadius: BorderRadius.circular(8), onTap: () => go(i, 0),
    child: Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10), decoration: BoxDecoration(borderRadius: BorderRadius.circular(8), border: on ? Border.all(color: C.line) : null), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Icon(hub.icon, size: 19, color: on ? C.indigo : C.ink2), const SizedBox(width: 11),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(hub.label, style: sans(14.5, w: 700, color: on ? C.indigo : C.ink)), if (hub.pages.length > 1) Text(hub.pages.map((x) => x.label).join(', '), style: sans(11.5, color: C.muted), maxLines: 2, overflow: TextOverflow.ellipsis)]))])))));
  }

  @override Widget build(BuildContext c) {
    final s = Scope.of(c), wide = isWide(c), hub = widget.hubs[h];
    final body = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Container(padding: EdgeInsets.symmetric(horizontal: wide ? 24 : 6, vertical: 10), decoration: const BoxDecoration(color: C.paper, border: Border(bottom: BorderSide(color: C.line))), child: SafeArea(bottom: false, child: Row(children: [
        if (!wide) IconButton(icon: const Icon(Icons.menu), onPressed: () => scaffold.currentState?.openDrawer()),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(widget.portalTitle, style: sans(11.5, color: C.muted)), Text(hub.pages[p].label, style: serif(wide ? 22 : 19), maxLines: 1, overflow: TextOverflow.ellipsis)])),
        StreamBuilder<int>(stream: s.rt.unreadChanged.stream, initialData: s.rt.unread, builder: (c, snap) => IconButton(tooltip: 'Notifications', onPressed: () => nav.currentState?.push(MaterialPageRoute(builder: (_) => const Scaffold(backgroundColor: C.paper, body: NotificationsPage()))),
          icon: Badge(isLabelVisible: (snap.data ?? 0) > 0, label: Text('${snap.data}'), backgroundColor: C.orange, child: const Icon(Icons.notifications_none)))),
        if (wide) ...[const SizedBox(width: 6), CircleAvatar(radius: 17, backgroundColor: C.indigoTint, child: Text(_initials(widget.who), style: sans(12.5, w: 700, color: C.indigo))), const SizedBox(width: 9),
          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [Text(widget.who, style: sans(14, w: 700)), Text(widget.roleLine, style: sans(12, color: C.muted))])],
        IconButton(tooltip: 'Sign out', icon: const Icon(Icons.logout), onPressed: () async { if (await confirm(c, 'Sign out of the app?', yes: 'Sign out')) s.logout(); }),
      ]))),
      if (hub.pages.length > 1) Container(height: 46, decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: C.line))), child: ListView(scrollDirection: Axis.horizontal, padding: EdgeInsets.symmetric(horizontal: wide ? 20 : 8), children: [
        for (var i = 0; i < hub.pages.length; i++) InkWell(onTap: () => go(h, i), child: Container(padding: const EdgeInsets.symmetric(horizontal: 14), alignment: Alignment.center, decoration: BoxDecoration(border: Border(bottom: BorderSide(color: i == p ? C.orange : Colors.transparent, width: 3))), child: Text(hub.pages[i].label, style: sans(14, w: i == p ? 700 : 500, color: i == p ? C.indigo : C.ink2))))])),
      if (!s.rt.connected && s.signedIn) StreamBuilder<bool>(stream: s.rt.connection, initialData: s.rt.connected, builder: (c, snap) => snap.data == true ? const SizedBox.shrink() : Container(color: C.warnBg, padding: const EdgeInsets.symmetric(vertical: 4), child: Center(child: Text('Reconnecting for live updates...', style: sans(12.5, color: C.warn))))),
      Expanded(child: Navigator(key: nav, onGenerateRoute: (_) => MaterialPageRoute(builder: (c) => _page(c), settings: const RouteSettings(name: '/')))),
      if (warn) Container(color: C.ink, padding: const EdgeInsets.all(10), child: Row(children: [Expanded(child: Text('You will be signed out soon because of inactivity.', style: sans(14, color: Colors.white))), FilledButton(onPressed: _act, child: const Text('Stay signed in'))])),
    ]);
    return Listener(behavior: HitTestBehavior.translucent, onPointerDown: (_) => _act(), onPointerMove: (_) => _last = DateTime.now(), onPointerSignal: (_) => _last = DateTime.now(),
      child: Scaffold(key: scaffold, backgroundColor: C.paper, drawer: wide ? null : Drawer(backgroundColor: C.paper2, width: 280, child: _side(true)), body: wide ? Row(children: [_side(false), Container(width: 1, color: C.line), Expanded(child: body)]) : body));
  }
}
String _initials(String n) { final p = n.trim().split(RegExp(r'\s+')); if (p.isEmpty || p[0].isEmpty) return '?'; return (p.first[0] + (p.length > 1 ? p.last[0] : '')).toUpperCase(); }
