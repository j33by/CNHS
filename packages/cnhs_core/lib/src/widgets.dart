import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'api.dart';
import 'session.dart';
import 'theme.dart';

bool isWide(BuildContext c) => MediaQuery.of(c).size.width >= 900;
bool isPhone(BuildContext c) => MediaQuery.of(c).size.width < 600;

/// ---------- formatting ----------
String fmtDate(dynamic v, [String f = 'MMM d, y']) { final d = v is DateTime ? v : DateTime.tryParse('$v'); return d == null ? '-' : DateFormat(f).format(d.toLocal()); }
String fmtDay(dynamic v) { final d = DateTime.tryParse('$v'); return d == null ? '-' : DateFormat('EEEE, MMMM d, y').format(d); }
String fmtDT(dynamic v) => fmtDate(v, 'MMM d, y h:mm a');
String t12(String t) { final p = t.split(':'); final h = int.parse(p[0]); return '${h % 12 == 0 ? 12 : h % 12}:${p[1]} ${h >= 12 ? 'PM' : 'AM'}'; }
String num2(dynamic v) { if (v == null) return '-'; final n = (v as num).toDouble(); return n == n.roundToDouble() ? n.toInt().toString() : n.toStringAsFixed(2).replaceFirst(RegExp(r'0+$'), ''); }
String todayStr() => DateFormat('yyyy-MM-dd').format(DateTime.now());
List<Map<String, dynamic>> rowsOf(dynamic v) => ((v as List?) ?? const []).map((e) => (e as Map).cast<String, dynamic>()).toList();
Map<String, dynamic> mapOf(dynamic v) => ((v as Map?) ?? const {}).cast<String, dynamic>();
int asInt(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

/// ---------- basic blocks ----------
class Eyebrow extends StatelessWidget { final String t; const Eyebrow(this.t, {super.key}); @override Widget build(BuildContext c) => Text(t.toUpperCase(), style: sans(11.5, w: 700, color: C.orangeInk).copyWith(letterSpacing: 1.4)); }

class Panel extends StatelessWidget {
  final String? title; final Widget? trailing; final Widget child; final EdgeInsets? padding; final bool flush;
  const Panel({super.key, this.title, this.trailing, required this.child, this.padding, this.flush = false});
  @override Widget build(BuildContext c) => Container(
    margin: const EdgeInsets.only(bottom: 16), clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(color: C.card, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(12)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (title != null) Container(padding: const EdgeInsets.fromLTRB(16, 12, 12, 10), decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: C.lineSoft))),
        child: Row(children: [Expanded(child: Text(title!, style: serif(17))), if (trailing != null) trailing!])),
      flush ? child : Padding(padding: padding ?? const EdgeInsets.all(16), child: child),
    ]));
}

class StatData { final String value, label; final String? sub; final bool warn; const StatData(this.value, this.label, {this.sub, this.warn = false}); }
class Stats extends StatelessWidget {
  final List<StatData> items; const Stats(this.items, {super.key});
  @override Widget build(BuildContext c) => Padding(padding: const EdgeInsets.only(bottom: 16), child: LayoutBuilder(builder: (c, k) {
    final per = k.maxWidth >= 900 ? 5 : k.maxWidth >= 560 ? 3 : 2; final w = (k.maxWidth - 12 * (per - 1)) / per;
    return Wrap(spacing: 12, runSpacing: 12, children: [for (final s in items) SizedBox(width: w, child: Container(padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: s.warn ? C.warnBg : C.card, border: Border.all(color: s.warn ? C.warn.withOpacity(.4) : C.line), borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(s.value, style: serif(26, color: s.warn ? C.warn : C.indigo), maxLines: 1, overflow: TextOverflow.ellipsis), const SizedBox(height: 2), Text(s.label, style: sans(13, color: C.ink2)), if (s.sub != null) Text(s.sub!, style: sans(12, color: C.muted))])))]);
  }));
}

class TagChip extends StatelessWidget {
  final String text; final String kind; const TagChip(this.text, {super.key, this.kind = ''});
  @override Widget build(BuildContext c) {
    Color bg = C.paper2, fg = C.ink2;
    if (['active', 'enrolled', 'graduated', 'ok', 'present', 'published', 'passed'].contains(kind)) { bg = C.okBg; fg = C.ok; }
    else if (['dropped', 'terminated', 'absent', 'failed', 'deleted'].contains(kind)) { bg = C.errBg; fg = C.err; }
    else if (['transferred', 'on_leave', 'warning', 'late', 'draft', 'resigned', 'retired'].contains(kind)) { bg = C.warnBg; fg = C.warn; }
    else if (kind == 'info') { bg = C.indigoTint; fg = C.indigo; }
    return Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)), child: Text(text, style: sans(12, w: 600, color: fg)));
  }
}
TagChip statusTag(String s, {Map<String, String>? labels}) => TagChip(labels?[s] ?? (s.isEmpty ? s : s[0].toUpperCase() + s.substring(1).replaceAll('_', ' ')), kind: s);
Widget standingTag(String s) => s == 'dropped' ? const TagChip('Dropped', kind: 'dropped') : s == 'warning' ? const TagChip('Warning', kind: 'warning') : const TagChip('OK', kind: 'ok');

class Empty extends StatelessWidget { final String t; const Empty(this.t, {super.key}); @override Widget build(BuildContext c) => Padding(padding: const EdgeInsets.all(24), child: Center(child: Text(t, textAlign: TextAlign.center, style: sans(14, color: C.muted)))); }
class AlertBox extends StatelessWidget {
  final String text; final String kind; const AlertBox(this.text, {super.key, this.kind = 'ok'});
  @override Widget build(BuildContext c) {
    final (bg, fg, ic) = kind == 'err' ? (C.errBg, C.err, Icons.error_outline) : kind == 'warn' ? (C.warnBg, C.warn, Icons.info_outline) : (C.okBg, C.ok, Icons.check_circle_outline);
    return Container(margin: const EdgeInsets.only(bottom: 14), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8), border: Border.all(color: fg.withOpacity(.3))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(ic, size: 18, color: fg), const SizedBox(width: 10), Expanded(child: Text(text, style: sans(14, color: fg)))]));
  }
}

/// ---------- buttons ----------
class Btn extends StatelessWidget {
  final String label; final VoidCallback? onTap; final bool pri, danger, small, wide; final IconData? icon;
  const Btn(this.label, this.onTap, {super.key, this.pri = false, this.danger = false, this.small = false, this.wide = false, this.icon});
  @override Widget build(BuildContext c) {
    final pad = EdgeInsets.symmetric(horizontal: small ? 12 : 18, vertical: small ? 8 : 13);
    final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(8));
    final child = Row(mainAxisSize: MainAxisSize.min, children: [if (icon != null) ...[Icon(icon, size: 16), const SizedBox(width: 6)], Flexible(child: Text(label, style: sans(small ? 13 : 14.5, w: 600), overflow: TextOverflow.ellipsis))]);
    final b = pri
        ? FilledButton(onPressed: onTap, style: FilledButton.styleFrom(backgroundColor: C.indigo, foregroundColor: Colors.white, padding: pad, shape: shape, minimumSize: Size.zero), child: child)
        : OutlinedButton(onPressed: onTap, style: OutlinedButton.styleFrom(backgroundColor: C.card, foregroundColor: danger ? C.err : C.ink, side: BorderSide(color: danger ? C.err.withOpacity(.5) : C.lineStrong), padding: pad, shape: shape, minimumSize: Size.zero), child: child);
    return wide ? SizedBox(width: double.infinity, child: b) : b;
  }
}

/// ---------- form fields ----------
InputDecoration _dec(String? hint, {Widget? suffix}) => InputDecoration(hintText: hint, isDense: true, filled: true, fillColor: C.field, suffixIcon: suffix, contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: C.lineStrong)), enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: C.lineStrong)),
  focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: C.indigo, width: 2)), hintStyle: sans(14, color: C.muted));
Widget labeled(String label, Widget field, {String? hint, bool req = false}) => Padding(padding: const EdgeInsets.only(bottom: 14), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
  Text.rich(TextSpan(children: [TextSpan(text: label, style: sans(13, w: 600, color: C.ink2)), if (req) TextSpan(text: ' *', style: sans(13, w: 700, color: C.orange))])), const SizedBox(height: 5), field,
  if (hint != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(hint, style: sans(12, color: C.muted)))]));

class Fld extends StatefulWidget {
  final String label; final TextEditingController ctl; final String? hint, help; final bool obscure, req, enabled; final int maxLines; final int? maxLength; final TextInputType? keyboard; final void Function(String)? onSubmit; final List<TextInputFormatter>? formatters; final void Function(String)? onChanged;
  const Fld(this.label, this.ctl, {super.key, this.hint, this.help, this.obscure = false, this.req = false, this.enabled = true, this.maxLines = 1, this.maxLength, this.keyboard, this.onSubmit, this.formatters, this.onChanged});
  @override State<Fld> createState() => _FldState();
}
class _FldState extends State<Fld> {
  bool _hide = true;
  @override Widget build(BuildContext c) => labeled(widget.label, TextField(controller: widget.ctl, enabled: widget.enabled, obscureText: widget.obscure && _hide, maxLines: widget.obscure ? 1 : widget.maxLines, minLines: widget.maxLines > 1 ? 3 : 1, maxLength: widget.maxLength, keyboardType: widget.keyboard, inputFormatters: widget.formatters, onSubmitted: widget.onSubmit, onChanged: widget.onChanged, style: sans(15),
    decoration: _dec(widget.hint, suffix: widget.obscure ? IconButton(icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 18), onPressed: () => setState(() => _hide = !_hide)) : null).copyWith(counterText: '')), hint: widget.help, req: widget.req);
}
class Drop<T> extends StatelessWidget {
  final String label; final T? value; final Map<T, String> items; final void Function(T?) onChanged; final bool req; final String? help;
  const Drop(this.label, this.value, this.items, this.onChanged, {super.key, this.req = false, this.help});
  @override Widget build(BuildContext c) => labeled(label, DropdownButtonFormField<T>(value: items.containsKey(value) ? value : null, isExpanded: true, items: [for (final e in items.entries) DropdownMenuItem<T>(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis, style: sans(15)))], onChanged: onChanged, decoration: _dec(null), dropdownColor: C.card), req: req, hint: help);
}
class DateFld extends StatelessWidget {
  final String label; final TextEditingController ctl; final bool req; final DateTime? first, last; final String? help;
  const DateFld(this.label, this.ctl, {super.key, this.req = false, this.first, this.last, this.help});
  @override Widget build(BuildContext c) => labeled(label, TextField(controller: ctl, readOnly: true, style: sans(15), decoration: _dec('YYYY-MM-DD', suffix: const Icon(Icons.calendar_today_outlined, size: 18)),
    onTap: () async { final init = DateTime.tryParse(ctl.text) ?? DateTime.now(); final d = await showDatePicker(context: c, initialDate: init, firstDate: first ?? DateTime(1950), lastDate: last ?? DateTime(2100)); if (d != null) ctl.text = DateFormat('yyyy-MM-dd').format(d); }), req: req, hint: help);
}
class TimeFld extends StatelessWidget {
  final String label; final TextEditingController ctl; const TimeFld(this.label, this.ctl, {super.key});
  @override Widget build(BuildContext c) => labeled(label, TextField(controller: ctl, readOnly: true, style: sans(15), decoration: _dec('HH:MM', suffix: const Icon(Icons.schedule, size: 18)),
    onTap: () async { final p = ctl.text.split(':'); final t = await showTimePicker(context: c, initialTime: TimeOfDay(hour: int.tryParse(p.first) ?? 8, minute: p.length > 1 ? int.tryParse(p[1]) ?? 0 : 0)); if (t != null) ctl.text = '${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}'; }));
}
class Check extends StatelessWidget {
  final String label; final bool value; final void Function(bool) onChanged; const Check(this.label, this.value, this.onChanged, {super.key});
  @override Widget build(BuildContext c) => InkWell(onTap: () => onChanged(!value), child: Padding(padding: const EdgeInsets.symmetric(vertical: 4), child: Row(children: [SizedBox(width: 28, height: 28, child: Checkbox(value: value, activeColor: C.indigo, onChanged: (v) => onChanged(v ?? false))), const SizedBox(width: 6), Expanded(child: Text(label, style: sans(14.5)))])));
}
class Wrapx extends StatelessWidget { final List<Widget> kids; final double gap; const Wrapx(this.kids, {super.key, this.gap = 10}); @override Widget build(BuildContext c) => Wrap(spacing: gap, runSpacing: gap, crossAxisAlignment: WrapCrossAlignment.end, children: kids); }
/// Responsive form grid: two columns when there is room.
class FormGrid extends StatelessWidget {
  final List<Widget> kids; const FormGrid(this.kids, {super.key});
  @override Widget build(BuildContext c) => LayoutBuilder(builder: (c, k) { final cols = k.maxWidth >= 640 ? 2 : 1; final w = (k.maxWidth - 16 * (cols - 1)) / cols; return Wrap(spacing: 16, children: [for (final x in kids) SizedBox(width: x is FullRow ? k.maxWidth : w, child: x is FullRow ? x.child : x)]); });
}
class FullRow extends StatelessWidget { final Widget child; const FullRow(this.child, {super.key}); @override Widget build(BuildContext c) => child; }
class FilterBar extends StatelessWidget {
  final List<Widget> kids; const FilterBar(this.kids, {super.key});
  @override Widget build(BuildContext c) => Container(margin: const EdgeInsets.only(bottom: 16), padding: const EdgeInsets.fromLTRB(14, 14, 14, 0), decoration: BoxDecoration(color: C.card, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(12)),
    child: Wrap(spacing: 12, runSpacing: 0, crossAxisAlignment: WrapCrossAlignment.end, children: [for (final k in kids) k is Drop || k is Fld || k is DateFld ? SizedBox(width: isPhone(c) ? double.infinity : 210, child: k) : Padding(padding: const EdgeInsets.only(bottom: 14), child: k)]));
}
class KV extends StatelessWidget {
  final Map<String, String> items; const KV(this.items, {super.key});
  @override Widget build(BuildContext c) => Column(children: [for (final e in items.entries) Container(padding: const EdgeInsets.symmetric(vertical: 9), decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: C.lineSoft))),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: isPhone(c) ? 110 : 170, child: Text(e.key, style: sans(13, w: 600, color: C.muted))), Expanded(child: SelectableText(e.value.isEmpty ? '-' : e.value, style: sans(14.5)))]))]);
}

/// ---------- table ----------
class DataTbl extends StatelessWidget {
  final List<String> head; final List<List<dynamic>> rows; final String emptyText; final Map<int, double>? widths;
  const DataTbl(this.head, this.rows, {super.key, this.emptyText = 'Nothing to show yet.', this.widths});
  @override Widget build(BuildContext c) {
    if (rows.isEmpty) return Empty(emptyText);
    Widget cell(dynamic v, {bool h = false}) => Padding(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10), child: v is Widget ? v : Text('$v', style: h ? sans(12.5, w: 700, color: C.ink2) : sans(14)));
    return LayoutBuilder(builder: (c, k) => SingleChildScrollView(scrollDirection: Axis.horizontal, child: ConstrainedBox(constraints: BoxConstraints(minWidth: k.maxWidth), child: Table(defaultColumnWidth: const IntrinsicColumnWidth(),
      columnWidths: widths?.map((i, w) => MapEntry<int, TableColumnWidth>(i, FixedColumnWidth(w))),
      border: const TableBorder(horizontalInside: BorderSide(color: C.lineSoft)), defaultVerticalAlignment: TableCellVerticalAlignment.middle, children: [
        TableRow(decoration: const BoxDecoration(color: C.paper2), children: [for (final h in head) cell(h, h: true)]),
        for (final r in rows) TableRow(children: [for (final v in r) cell(v)]),
      ]))));
  }
}
class Pager extends StatelessWidget {
  final int total, per, page; final void Function(int) onPage; const Pager(this.total, this.per, this.page, this.onPage, {super.key});
  @override Widget build(BuildContext c) { final pages = (total / per).ceil(); if (pages <= 1) return const SizedBox.shrink();
    return Padding(padding: const EdgeInsets.only(bottom: 16), child: Wrap(spacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [Btn('Previous', page > 1 ? () => onPage(page - 1) : null, small: true), Text('Page $page of $pages · $total records', style: sans(13, color: C.muted)), Btn('Next', page < pages ? () => onPage(page + 1) : null, small: true)])); }
}

/// ---------- page scaffolding ----------
class PageBody extends StatelessWidget {
  final List<Widget> children; const PageBody(this.children, {super.key});
  @override Widget build(BuildContext c) => SingleChildScrollView(padding: EdgeInsets.all(isPhone(c) ? 14 : 24), child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1180), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children))));
}
class Hello extends StatelessWidget {
  final String line; final List<Widget> actions; const Hello(this.line, {super.key, this.actions = const []});
  @override Widget build(BuildContext c) => Padding(padding: const EdgeInsets.only(bottom: 18), child: Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, runSpacing: 10, children: [
    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Eyebrow(DateFormat('EEEE, MMMM d, y').format(DateTime.now())), const SizedBox(height: 4), Text(line, style: serif(27))]), Wrap(spacing: 10, children: actions)]));
}
class Back extends StatelessWidget { final String label; const Back(this.label, {super.key}); @override Widget build(BuildContext c) => Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(bottom: 12), child: TextButton.icon(onPressed: () => Navigator.of(c).maybePop(), icon: const Icon(Icons.arrow_back, size: 16), label: Text(label, style: sans(14, w: 600, color: C.indigo))))); }

/// ---------- loading with live refresh ----------
/// Loads data, draws it, and reloads by itself when the server says one of [topics] changed.
class Live extends StatefulWidget {
  final Future<Json> Function() load; final List<String> topics; final Widget Function(BuildContext, Json, Future<void> Function()) builder; final Object? reloadKey;
  const Live({super.key, required this.load, required this.builder, this.topics = const [], this.reloadKey});
  @override State<Live> createState() => _LiveState();
}
class _LiveState extends State<Live> {
  Json? data; String? error; bool loading = true; StreamSubscription? _sub; DateTime _at = DateTime.now();
  @override void initState() { super.initState(); _go(); }
  @override void didChangeDependencies() { super.didChangeDependencies(); _sub ??= Scope.read(context).rt.topics.listen((t) { if (!mounted) return; if (widget.topics.contains(t) || (t == '*' && DateTime.now().difference(_at).inSeconds > 8)) _go(quiet: true); }); }
  @override void didUpdateWidget(Live o) { super.didUpdateWidget(o); if (o.reloadKey != widget.reloadKey) _go(); }
  @override void dispose() { _sub?.cancel(); super.dispose(); }
  Future<void> _go({bool quiet = false}) async {
    if (!quiet && mounted) setState(() { loading = data == null; error = null; });
    try { final d = await widget.load(); _at = DateTime.now(); if (mounted) setState(() { data = d; error = null; loading = false; }); }
    catch (e) { if (mounted) setState(() { if (data == null) error = e is ApiException ? e.message : 'Something went wrong.'; loading = false; }); if (e is ApiException && e.mustChange) Scope.read(context).refresh(); }
  }
  @override Widget build(BuildContext c) {
    if (data != null) return widget.builder(c, data!, () => _go(quiet: true));
    if (loading) return const Padding(padding: EdgeInsets.all(48), child: Center(child: CircularProgressIndicator(color: C.indigo)));
    return Padding(padding: const EdgeInsets.all(24), child: Column(children: [AlertBox(error ?? 'Could not load.', kind: 'err'), Btn('Try again', _go)]));
  }
}

/// ---------- actions, toasts, dialogs ----------
void toast(BuildContext c, String m, {bool err = false}) { ScaffoldMessenger.of(c).hideCurrentSnackBar(); ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text(m, style: sans(14, color: Colors.white)), backgroundColor: err ? C.err : C.ink, behavior: SnackBarBehavior.floating, duration: Duration(seconds: err ? 6 : 3))); }
Future<bool> confirm(BuildContext c, String m, {String yes = 'Yes', bool danger = false}) async => (await showDialog<bool>(context: c, builder: (x) => AlertDialog(backgroundColor: C.card, content: Text(m, style: sans(15)), actions: [TextButton(onPressed: () => Navigator.pop(x, false), child: const Text('Cancel')), FilledButton(style: FilledButton.styleFrom(backgroundColor: danger ? C.err : C.indigo), onPressed: () => Navigator.pop(x, true), child: Text(yes))])) ?? false);

/// Runs an API call, shows the server's message (or error), offers Undo for deletes and shows one-time credentials.
Future<Json?> act(BuildContext c, Future<Json> Function() f, {String? ok, bool quiet = false}) async {
  final s = Scope.read(c);
  try {
    final r = await f();
    if (!c.mounted) return r;
    if (r['cred'] != null) showCred(c, mapOf(r['cred']));
    if (r['undo'] != null) {
      final u = mapOf(r['undo']); ScaffoldMessenger.of(c).hideCurrentSnackBar();
      ScaffoldMessenger.of(c).showSnackBar(SnackBar(content: Text('${u['message']}. You can also restore it from Activity logs.', style: sans(14, color: Colors.white)), backgroundColor: C.ink, behavior: SnackBarBehavior.floating, duration: Duration(seconds: asInt(u['seconds']) == 0 ? 12 : asInt(u['seconds'])),
        action: SnackBarAction(label: 'Undo', textColor: C.orangeTint, onPressed: () async { try { final x = await s.api.post('/${s.role.name}/logs/restore', {'id': u['id']}); if (c.mounted) toast(c, '${x['message']}'); } on ApiException catch (e) { if (c.mounted) toast(c, e.message, err: true); } })));
    } else if (!quiet) { final m = ok ?? r['message']?.toString(); if (m != null && m.isNotEmpty && r['cred'] == null) toast(c, m); }
    return r;
  } on ApiException catch (e) { if (c.mounted) toast(c, e.message, err: true); if (e.mustChange) s.refresh(); return null; }
}
void showCred(BuildContext c, Json cr) => showDialog(context: c, barrierDismissible: false, builder: (x) => AlertDialog(backgroundColor: C.card, title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [const Eyebrow('Portal account ready'), const SizedBox(height: 4), Text('${cr['name']}', style: serif(20))]),
  content: SizedBox(width: 420, child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
    _copyRow('${cr['label']}', '${cr['id']}'), _copyRow('Temporary password', '${cr['pw']}'), const SizedBox(height: 8), Text('${cr['note']}', style: sans(13, color: C.muted))])),
  actions: [FilledButton(onPressed: () => Navigator.pop(x), child: const Text('Done'))]));
Widget _copyRow(String l, String v) => Builder(builder: (c) => Container(margin: const EdgeInsets.only(top: 12), padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: C.paper2, borderRadius: BorderRadius.circular(8)), child: Row(children: [
  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(l, style: sans(12, w: 600, color: C.muted)), SelectableText(v, style: mono.copyWith(fontSize: 20, fontWeight: FontWeight.w700))])),
  IconButton(icon: const Icon(Icons.copy, size: 18), onPressed: () { Clipboard.setData(ClipboardData(text: v)); toast(c, 'Copied.'); })])));
void showIssued(BuildContext c, Json i) => showDialog(context: c, builder: (x) => AlertDialog(backgroundColor: C.card, title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Eyebrow(i['kind'] == 'student' ? 'Enrollment complete' : 'Teacher added'), const SizedBox(height: 4), Text('${i['name']}', style: serif(20))]),
  content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [Text(i['kind'] == 'student' ? 'Student ID number' : 'Teacher ID number', style: sans(13, color: C.muted)), SelectableText('${i['no']}', style: mono.copyWith(fontSize: 28, fontWeight: FontWeight.w700, color: C.indigo)), const SizedBox(height: 8),
    Text('This is the sign-in ID. Create a portal password from the record so ${i['kind'] == 'student' ? 'the student' : 'the teacher'} can sign in.', style: sans(13.5, color: C.ink2))]),
  actions: [TextButton(onPressed: () { Clipboard.setData(ClipboardData(text: '${i['no']}')); }, child: const Text('Copy ID')), FilledButton(onPressed: () => Navigator.pop(x), child: const Text('Done'))]));

/// Pushes a page inside the app shell (keeps the side menu).
Future<T?> openPage<T>(BuildContext c, Widget page) => Navigator.of(c).push<T>(MaterialPageRoute(builder: (_) => Scaffold(backgroundColor: C.paper, body: page)));
