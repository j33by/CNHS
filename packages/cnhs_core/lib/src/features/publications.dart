import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:url_launcher/url_launcher.dart';
import '../api.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';
import 'announcements.dart' show reactionEmoji, reactionLabel;

String imgUrl(String base, String? name) => (name == null || name.isEmpty) ? '' : '$base$name';
Alignment _al(String? a) => a == 'center' ? Alignment.center : a == 'right' ? Alignment.centerRight : Alignment.centerLeft;
TextAlign _ta(String? a) => a == 'center' ? TextAlign.center : a == 'right' ? TextAlign.right : TextAlign.left;
Color _tone(String? t) => t == 'indigo' ? C.indigo : t == 'orange' ? C.orangeInk : t == 'muted' ? C.muted : C.ink;

/// Draws a designed article (the block list) with the same look as the website.
class PubBlocksView extends StatelessWidget {
  final List<dynamic> blocks; final String imgBase; const PubBlocksView(this.blocks, this.imgBase, {super.key});
  Widget _paras(String t, TextStyle st, TextAlign al) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final p in t.split(RegExp(r'\n{2,}'))) if (p.trim().isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(p.trim(), style: st, textAlign: al))]);
  Widget _img(String src, String alt, {double? w}) => ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(imgUrl(imgBase, src), width: w, fit: BoxFit.cover, semanticLabel: alt, errorBuilder: (_, __, ___) => Container(height: 120, color: C.paper2, child: const Icon(Icons.broken_image_outlined))));
  @override Widget build(BuildContext c) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final raw in blocks) _block(c, mapOf(raw))]);
  Widget _block(BuildContext c, Map<String, dynamic> b) {
    final al = b['align'] as String?;
    switch (b['type']) {
      case 'h1': case 'h2': case 'h3': if ('${b['text']}'.isEmpty) return const SizedBox.shrink(); final sz = {'h1': 28.0, 'h2': 22.0, 'h3': 18.0}[b['type']]!; return Padding(padding: const EdgeInsets.only(top: 10, bottom: 8), child: Text('${b['text']}', style: serif(sz, color: _tone(b['tone'] as String?)), textAlign: _ta(al)));
      case 'text': if ('${b['text']}'.isEmpty) return const SizedBox.shrink(); final sz = {'sm': 14.0, 'md': 16.0, 'lg': 19.0}[b['size']] ?? 16.0, st = b['style'];
        final inner = _paras('${b['text']}', sans(sz, height: 1.6), _ta(al)); return st == 'plain' ? inner : Container(margin: const EdgeInsets.only(bottom: 10), padding: const EdgeInsets.all(14), decoration: BoxDecoration(color: st == 'accent' ? C.indigoTint : st == 'note' ? C.warnBg : C.paper2, borderRadius: BorderRadius.circular(8), border: st == 'note' ? const Border(left: BorderSide(color: C.orange, width: 4)) : null), child: inner);
      case 'quote': if ('${b['text']}'.isEmpty) return const SizedBox.shrink(); return Container(margin: const EdgeInsets.symmetric(vertical: 10), padding: const EdgeInsets.fromLTRB(16, 6, 6, 6), decoration: const BoxDecoration(border: Border(left: BorderSide(color: C.orange, width: 4))), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${b['text']}', style: serif(20, w: 400), textAlign: _ta(al)), if ('${b['cite']}'.isNotEmpty) Text('— ${b['cite']}', style: sans(13, color: C.muted))]));
      case 'image': if ('${b['src']}'.isEmpty) return const SizedBox.shrink(); final w = {'full': 1.0, 'wide': .85, 'half': .5, 'small': .3}[b['width']] ?? .85;
        return Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Align(alignment: _al(b['align'] as String?), child: FractionallySizedBox(widthFactor: w, child: Column(children: [_img('${b['src']}', '${b['alt']}'), if ('${b['caption']}'.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('${b['caption']}', style: sans(12.5, color: C.muted), textAlign: TextAlign.center))]))));
      case 'split': final pic = '${b['src']}'.isEmpty ? null : _img('${b['src']}', '${b['alt']}'); final txt = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [if ('${b['title']}'.isNotEmpty) Text('${b['title']}', style: serif(19)), const SizedBox(height: 6), _paras('${b['text']}', sans(15.5, height: 1.55), TextAlign.left)]);
        return Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: isPhone(c) || pic == null ? Column(children: [if (pic != null) pic, const SizedBox(height: 8), txt]) : Row(crossAxisAlignment: CrossAxisAlignment.start, children: b['side'] == 'right' ? [Expanded(child: txt), const SizedBox(width: 16), Expanded(child: pic)] : [Expanded(child: pic), const SizedBox(width: 16), Expanded(child: txt)]));
      case 'link': if ('${b['label']}'.isEmpty || '${b['url']}'.isEmpty) return const SizedBox.shrink(); final st = b['style'];
        return Padding(padding: const EdgeInsets.symmetric(vertical: 8), child: Align(alignment: _al(al), child: st == 'text' ? TextButton(onPressed: () => _open('${b['url']}'), child: Text('${b['label']}', style: sans(15, w: 600, color: C.indigo))) : st == 'outline' ? OutlinedButton(onPressed: () => _open('${b['url']}'), child: Text('${b['label']}')) : FilledButton(style: FilledButton.styleFrom(backgroundColor: C.indigo), onPressed: () => _open('${b['url']}'), child: Text('${b['label']}'))));
      case 'list': final items = '${b['text']}'.split('\n').map((e) => e.trim()).where((e) => e.isNotEmpty).toList(); return Padding(padding: const EdgeInsets.symmetric(vertical: 6), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [for (var i = 0; i < items.length; i++) Padding(padding: const EdgeInsets.only(bottom: 4), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 26, child: Text(b['ordered'] == 1 ? '${i + 1}.' : '•', style: sans(15.5))), Expanded(child: Text(items[i], style: sans(15.5, height: 1.5)))]))]));
      case 'divider': return Padding(padding: const EdgeInsets.symmetric(vertical: 10), child: b['style'] == 'dots' ? Center(child: Text('• • •', style: sans(16, color: C.muted))) : const Divider());
      case 'spacer': return SizedBox(height: {'sm': 10.0, 'md': 24.0, 'lg': 48.0}[b['size']] ?? 24);
    }
    return const SizedBox.shrink();
  }
  Future<void> _open(String u) async { final uri = Uri.tryParse(u); if (uri != null && (uri.hasScheme)) await launchUrl(uri, mode: LaunchMode.externalApplication); }
}

class ReactionBar extends StatelessWidget {
  final Map<String, dynamic> counts; final String? mine; final void Function(String) onReact; const ReactionBar(this.counts, this.mine, this.onReact, {super.key});
  @override Widget build(BuildContext c) => Wrap(spacing: 8, runSpacing: 6, children: [for (final k in reactionLabel.keys) InkWell(borderRadius: BorderRadius.circular(20), onTap: () => onReact(k), child: Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(color: mine == k ? C.indigoTint : C.card, border: Border.all(color: mine == k ? C.indigo : C.line), borderRadius: BorderRadius.circular(20)), child: Row(mainAxisSize: MainAxisSize.min, children: [Text(reactionEmoji[k]!), const SizedBox(width: 5), Text(reactionLabel[k]!, style: sans(13, w: 600)), const SizedBox(width: 5), Text('${counts[k] ?? 0}', style: sans(13, w: 700, color: C.indigo))])))]);
}

/// Opens an article inside the app (students and teachers). Reactions are saved at once.
class PubReaderPage extends StatefulWidget { final String scope, slug; const PubReaderPage(this.scope, this.slug, {super.key}); @override State<PubReaderPage> createState() => _ReaderState(); }
class _ReaderState extends State<PubReaderPage> {
  Map<String, dynamic>? counts; String? mine; bool set = false;
  @override Widget build(BuildContext c) {
    final s = Scope.read(c);
    return Live(load: () => s.api.get('/${widget.scope}/pub/read/${widget.slug}'), builder: (c, d, reload) {
      final a = mapOf(d['article']), base = '${d['imgBase']}'; if (!set) { counts = mapOf(d['counts']); mine = d['mine'] as String?; set = true; }
      final url = '${s.api.baseUrl.replaceAll(RegExp(r'/+$'), '')}/publication/${a['slug']}';
      return PageBody([const Back('All publications'), Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Eyebrow('${a['author_type'] == 'teacher' ? 'Teacher' : 'Administration'} publication'), const SizedBox(height: 6), Text('${a['title']}', style: serif(28)), const SizedBox(height: 6),
        Text('By ${a['author_name']} · ${fmtDate(a['published_at'] ?? a['created_at'], 'MMMM d, y')}', style: sans(13.5, color: C.muted)), const SizedBox(height: 14),
        if (a['cover'] != null) Padding(padding: const EdgeInsets.only(bottom: 14), child: ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.network(imgUrl(base, '${a['cover']}'), width: double.infinity, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox.shrink()))),
        PubBlocksView(a['blocks'] as List, base), const Divider(height: 32),
        ReactionBar(counts!, mine, (k) async { final r = await act(c, () => s.api.post('/${widget.scope}/pub/react', {'pid': a['id'], 'reaction': k}), quiet: true); if (r != null) setState(() { counts = mapOf(r['counts']); mine = r['mine'] as String?; }); }),
        const SizedBox(height: 14), Text('Public link (anyone can open it)', style: sans(12, color: C.muted)), SelectableText(url, style: mono)]))]);
    });
  }
}

/// Teachers: the school's publications, to read and react to.
class PubReadList extends StatelessWidget {
  final String scope; const PubReadList(this.scope, {super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(topics: const ['publications', 'feed'], load: () => s.api.get('/$scope/pub/read'), builder: (c, d, reload) {
      final base = '${d['imgBase']}', rows = rowsOf(d['rows']);
      return PageBody([if (rows.isEmpty) const Empty('No publications yet.'), for (final a in rows) Panel(child: InkWell(onTap: () async { await openPage(c, PubReaderPage(scope, '${a['slug']}')); reload(); }, child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (a['cover'] != null) Padding(padding: const EdgeInsets.only(right: 14), child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(imgUrl(base, '${a['cover']}'), width: 110, height: 80, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(width: 110)))),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${a['title']}', style: serif(18)), Text('${a['author_name']} · ${fmtDate(a['published_at'] ?? a['created_at'])}', style: sans(12.5, color: C.muted)), if ('${a['excerpt']}'.isNotEmpty) Text('${a['excerpt']}', style: sans(14), maxLines: 3, overflow: TextOverflow.ellipsis)]))]))), Pager(asInt(d['total']), asInt(d['per']), 1, (_) {})]);
    }); }
}

/// Articles the signed-in person may edit (admin: all, teacher: own), with New / Edit / Delete.
class PubManagePage extends StatelessWidget {
  final String scope; const PubManagePage(this.scope, {super.key});
  @override Widget build(BuildContext c) { final s = Scope.read(c);
    return Live(topics: const ['publications'], load: () => s.api.get('/$scope/pub/articles'), builder: (c, d, reload) {
      final rows = rowsOf(d['rows']);
      return PageBody([Align(alignment: Alignment.centerLeft, child: Padding(padding: const EdgeInsets.only(bottom: 14), child: Btn('New article', () async { await openPage(c, PubEditorPage(scope)); reload(); }, pri: true, icon: Icons.add))),
        Panel(title: 'Articles', flush: true, child: DataTbl(['Title', 'Status', if (scope == 'admin') 'Author', 'Updated', ''], [for (final r in rows) ['${r['title']}', statusTag('${r['status']}'), if (scope == 'admin') '${r['author_name']}', fmtDate(r['updated_at']),
          Wrapx([Btn('Edit', () async { await openPage(c, PubEditorPage(scope, id: asInt(r['id']))); reload(); }, small: true),
            if (r['status'] == 'published') Btn('View public page', () => launchUrl(Uri.parse('${s.api.baseUrl.replaceAll(RegExp(r'/+$'), '')}/publication/${r['slug']}'), mode: LaunchMode.externalApplication), small: true),
            Btn('Delete', () async { if (await confirm(c, 'Delete "${r['title']}"? You can restore it from Activity logs.', yes: 'Delete', danger: true)) { await act(c, () => s.api.post('/$scope/pub/articles/${r['id']}/delete', {})); reload(); } }, small: true, danger: true)])]], emptyText: 'No articles yet. Press New article.'))]);
    }); }
}

/// The page designer: add elements, drag to reorder, edit, preview, save draft or publish.
class PubEditorPage extends StatefulWidget { final String scope; final int? id; const PubEditorPage(this.scope, {super.key, this.id}); @override State<PubEditorPage> createState() => _EditorState(); }
const _defaults = <String, Map<String, dynamic>>{
  'h1': {'text': '', 'align': 'left', 'tone': 'ink'}, 'h2': {'text': '', 'align': 'left', 'tone': 'ink'}, 'h3': {'text': '', 'align': 'left', 'tone': 'ink'},
  'text': {'text': '', 'align': 'left', 'size': 'md', 'style': 'plain'}, 'quote': {'text': '', 'cite': '', 'align': 'left'}, 'image': {'src': '', 'alt': '', 'caption': '', 'width': 'wide', 'align': 'center'},
  'split': {'src': '', 'alt': '', 'title': '', 'text': '', 'side': 'left'}, 'link': {'label': '', 'url': '', 'style': 'button', 'align': 'left'}, 'list': {'text': '', 'ordered': 0}, 'divider': {'style': 'line'}, 'spacer': {'size': 'md'}};
const _names = {'h1': 'Heading 1', 'h2': 'Heading 2', 'h3': 'Heading 3', 'text': 'Text box', 'image': 'Image box', 'split': 'Image + text', 'link': 'Link', 'quote': 'Quote', 'list': 'List', 'divider': 'Divider', 'spacer': 'Spacer'};
class _EditorState extends State<PubEditorPage> {
  final title = TextEditingController(), excerpt = TextEditingController(); String cover = '', status = 'draft', imgBase = ''; int? id; List<Map<String, dynamic>> blocks = []; bool loading = true, preview = false, busy = false; String? slug;
  @override void initState() { super.initState(); id = widget.id; _load(); }
  Future<void> _load() async {
    final s = Scope.read(context);
    try {
      if (id != null) { final r = await s.api.get('/${widget.scope}/pub/articles/$id'); final a = mapOf(r['article']); title.text = '${a['title']}'; excerpt.text = '${a['excerpt']}'; cover = '${a['cover'] ?? ''}'; status = '${a['status']}'; slug = '${a['slug']}'; blocks = rowsOf(a['blocks']); imgBase = '${r['imgBase']}'; }
      else { final r = await s.api.get('/${widget.scope}/pub/articles'); imgBase = '${r['imgBase']}'; }
    } on ApiException catch (e) { if (mounted) toast(context, e.message, err: true); }
    if (mounted) setState(() => loading = false);
  }
  Future<String?> _pickUpload() async {
    final s = Scope.read(context); final f = await FilePicker.platform.pickFiles(type: FileType.image, withData: true); if (f == null || f.files.isEmpty || f.files.first.bytes == null) return null;
    try { final r = await s.api.upload('/${widget.scope}/pub/upload', f.files.first.bytes!, f.files.first.name); return '${r['name']}'; } on ApiException catch (e) { if (mounted) toast(context, e.message, err: true); return null; }
  }
  Future<void> save(String st) async {
    final s = Scope.read(context); setState(() => busy = true);
    final r = await act(context, () => s.api.post('/${widget.scope}/pub/articles', {'id': id, 'title': title.text, 'excerpt': excerpt.text, 'cover': cover, 'status': st, 'blocks': blocks}));
    if (mounted) setState(() => busy = false);
    if (r != null) { final a = mapOf(r['article']); setState(() { id = asInt(r['id']); status = '${a['status']}'; slug = '${a['slug']}'; }); }
  }
  void add(String t) => setState(() => blocks.add({'type': t, ...Map<String, dynamic>.from(_defaults[t]!)}));
  Widget _opt(Map<String, dynamic> b, String key, String label, Map<String, String> items) => SizedBox(width: 150, child: Drop<String>(label, '${b[key]}', items, (v) => setState(() => b[key] = v ?? b[key])));
  Widget _txt(Map<String, dynamic> b, String key, String label, {int lines = 1, int max = 200}) => Fld(label, TextEditingController(text: '${b[key] ?? ''}')..addListener(() {}), maxLines: lines, maxLength: max, onChanged: (v) => b[key] = v);
  Widget _pic(Map<String, dynamic> b) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
    if ('${b['src']}'.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 8), child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(imgUrl(imgBase, '${b['src']}'), height: 140, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(height: 60)))),
    Btn('${b['src']}'.isEmpty ? 'Add a picture' : 'Replace picture', () async { final n = await _pickUpload(); if (n != null) setState(() => b['src'] = n); }, small: true, icon: Icons.add_photo_alternate_outlined), const SizedBox(height: 10), _txt(b, 'alt', 'Picture description (for screen readers)', max: 160)]);
  Widget _fields(Map<String, dynamic> b) {
    const al = {'left': 'Left', 'center': 'Center', 'right': 'Right'};
    switch (b['type']) {
      case 'h1': case 'h2': case 'h3': return Column(children: [_txt(b, 'text', 'Heading'), Wrapx([_opt(b, 'align', 'Align', al), _opt(b, 'tone', 'Colour', const {'ink': 'Ink', 'indigo': 'Indigo', 'orange': 'Orange', 'muted': 'Muted'})])]);
      case 'text': return Column(children: [_txt(b, 'text', 'Text (blank line = new paragraph)', lines: 6, max: 6000), Wrapx([_opt(b, 'align', 'Align', al), _opt(b, 'size', 'Size', const {'sm': 'Small', 'md': 'Medium', 'lg': 'Large'}), _opt(b, 'style', 'Style', const {'plain': 'Plain', 'soft': 'Soft box', 'accent': 'Accent box', 'note': 'Note'})])]);
      case 'quote': return Column(children: [_txt(b, 'text', 'Quote', lines: 3, max: 1000), _txt(b, 'cite', 'Who said it', max: 120), _opt(b, 'align', 'Align', al)]);
      case 'image': return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_pic(b), _txt(b, 'caption', 'Caption', max: 240), Wrapx([_opt(b, 'width', 'Width', const {'full': 'Full', 'wide': 'Wide', 'half': 'Half', 'small': 'Small'}), _opt(b, 'align', 'Align', al)])]);
      case 'split': return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_pic(b), _txt(b, 'title', 'Title', max: 160), _txt(b, 'text', 'Text', lines: 4, max: 3000), _opt(b, 'side', 'Picture on', const {'left': 'Left', 'right': 'Right'})]);
      case 'link': return Column(children: [_txt(b, 'label', 'Link text', max: 120), _txt(b, 'url', 'Web address (https://...)', max: 500), Wrapx([_opt(b, 'style', 'Style', const {'button': 'Button', 'outline': 'Outline', 'text': 'Text'}), _opt(b, 'align', 'Align', al)])]);
      case 'list': return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [_txt(b, 'text', 'One item per line', lines: 4, max: 3000), Check('Numbered list', b['ordered'] == 1, (v) => setState(() => b['ordered'] = v ? 1 : 0))]);
      case 'divider': return _opt(b, 'style', 'Style', const {'line': 'Line', 'dots': 'Dots'});
      case 'spacer': return _opt(b, 'size', 'Size', const {'sm': 'Small', 'md': 'Medium', 'lg': 'Large'});
    }
    return const SizedBox.shrink();
  }
  @override Widget build(BuildContext c) {
    if (loading) return const Center(child: CircularProgressIndicator(color: C.indigo));
    final s = Scope.read(c), pub = status == 'published';
    return PageBody([const Back('All articles'),
      Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Fld('Article title', title, maxLength: 200, hint: 'Write a headline'), Fld('Short summary (optional, shown on cards)', excerpt, maxLength: 300, maxLines: 2),
        Row(children: [if (cover.isNotEmpty) Padding(padding: const EdgeInsets.only(right: 12), child: ClipRRect(borderRadius: BorderRadius.circular(6), child: Image.network(imgUrl(imgBase, cover), width: 90, height: 60, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(width: 90)))),
          Btn(cover.isEmpty ? 'Add cover picture' : 'Change cover', () async { final n = await _pickUpload(); if (n != null) setState(() => cover = n); }, small: true), if (cover.isNotEmpty) TextButton(onPressed: () => setState(() => cover = ''), child: const Text('Remove'))]),
        const SizedBox(height: 14), Wrapx([Btn(preview ? 'Back to editing' : 'Preview', () => setState(() => preview = !preview), icon: Icons.visibility_outlined),
          if (pub && slug != null) Btn('View public page', () => launchUrl(Uri.parse('${s.api.baseUrl.replaceAll(RegExp(r'/+$'), '')}/publication/$slug'), mode: LaunchMode.externalApplication)),
          Btn(pub ? 'Unpublish (save as draft)' : 'Save draft', busy ? null : () => save('draft')), Btn(pub ? 'Update' : 'Publish', busy ? null : () => save('published'), pri: true)])])),
      if (preview) Panel(title: 'Preview', child: PubBlocksView(blocks, imgBase))
      else ...[
        Panel(title: 'Add an element', child: Wrapx([for (final e in _names.entries) ActionChip(label: Text(e.value), avatar: const Icon(Icons.add, size: 16), onPressed: () => add(e.key))])),
        if (blocks.isEmpty) const Empty('Your page is empty. Add a heading, text box or image above.'),
        ReorderableListView(shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), buildDefaultDragHandles: false, onReorder: (a, b) => setState(() { if (b > a) b--; blocks.insert(b, blocks.removeAt(a)); }), children: [
          for (var i = 0; i < blocks.length; i++) Container(key: ObjectKey(blocks[i]), margin: const EdgeInsets.only(bottom: 12), decoration: BoxDecoration(color: C.card, border: Border.all(color: C.line), borderRadius: BorderRadius.circular(12)), child: Column(children: [
            Container(padding: const EdgeInsets.fromLTRB(4, 4, 8, 4), decoration: const BoxDecoration(color: C.paper2, borderRadius: BorderRadius.vertical(top: Radius.circular(11))), child: Row(children: [ReorderableDragStartListener(index: i, child: const Padding(padding: EdgeInsets.all(8), child: Icon(Icons.drag_indicator, color: C.muted))),
              Expanded(child: Text(_names['${blocks[i]['type']}'] ?? '', style: sans(14, w: 700))), IconButton(tooltip: 'Move up', icon: const Icon(Icons.arrow_upward, size: 18), onPressed: i == 0 ? null : () => setState(() => blocks.insert(i - 1, blocks.removeAt(i)))),
              IconButton(tooltip: 'Move down', icon: const Icon(Icons.arrow_downward, size: 18), onPressed: i == blocks.length - 1 ? null : () => setState(() => blocks.insert(i + 1, blocks.removeAt(i)))),
              IconButton(tooltip: 'Duplicate', icon: const Icon(Icons.copy, size: 18), onPressed: () => setState(() => blocks.insert(i + 1, Map<String, dynamic>.from(blocks[i])))), IconButton(tooltip: 'Remove', icon: const Icon(Icons.delete_outline, size: 20, color: C.err), onPressed: () => setState(() => blocks.removeAt(i)))])),
            Padding(padding: const EdgeInsets.all(14), child: Align(alignment: Alignment.topLeft, child: _fields(blocks[i])))]))]),
      ]]);
  }
}
