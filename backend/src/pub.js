import crypto from 'node:crypto';
import sharp from 'sharp';
import multer from 'multer';
import { db } from './db.js';
import { HttpError, wrap, esc, str } from './util.js';
import { imgBase, saveImage } from './storage.js';

export const PUB_MAX_BLOCKS = 120;
export const PUB_BLOCKS = ['h1', 'h2', 'h3', 'text', 'quote', 'image', 'split', 'link', 'list', 'divider', 'spacer'];
const en = (v, ok, d) => (typeof v === 'string' && ok.includes(v) ? v : d);
const ps = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').trim().slice(0, max) : '');
const pimg = (v) => (typeof v === 'string' && /^[a-f0-9]{24}\.(jpg|png|gif|webp)$/.test(v) ? v : '');
/** http(s), mailto, tel, or a plain relative page of this site. Anything else (javascript:, data:, ...) becomes empty. */
export function safeUrl(u) {
  u = String(u || '').trim();
  if (!u || u.length > 500 || /[\x00-\x20"<>\\]/.test(u)) return '';
  if (/^https?:\/\//i.test(u)) { try { new URL(u); return u; } catch { return ''; } }
  if (/^(mailto|tel):\S+$/i.test(u)) return u;
  if (/^(?![a-z][a-z0-9+.\-]*:)(?!\/\/)[A-Za-z0-9_\-./?=&#%~]+$/i.test(u)) return u;
  return '';
}
/** Nothing raw is ever stored or printed: every block is rebuilt from a whitelist. */
export function cleanBlocks(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const b of raw.slice(0, PUB_MAX_BLOCKS)) {
    if (!b || typeof b !== 'object') continue;
    const t = b.type; if (!PUB_BLOCKS.includes(t)) continue;
    const al = en(b.align, ['left', 'center', 'right'], 'left'); const x = { type: t };
    switch (t) {
      case 'h1': case 'h2': case 'h3': Object.assign(x, { text: ps(b.text, 200), align: al, tone: en(b.tone, ['ink', 'indigo', 'orange', 'muted'], 'ink') }); break;
      case 'text': Object.assign(x, { text: ps(b.text, 6000), align: al, size: en(b.size, ['sm', 'md', 'lg'], 'md'), style: en(b.style, ['plain', 'soft', 'accent', 'note'], 'plain') }); break;
      case 'quote': Object.assign(x, { text: ps(b.text, 1000), cite: ps(b.cite, 120), align: al }); break;
      case 'image': Object.assign(x, { src: pimg(b.src), alt: ps(b.alt, 160), caption: ps(b.caption, 240), width: en(b.width, ['full', 'wide', 'half', 'small'], 'wide'), align: en(b.align, ['left', 'center', 'right'], 'center') }); break;
      case 'split': Object.assign(x, { src: pimg(b.src), alt: ps(b.alt, 160), title: ps(b.title, 160), text: ps(b.text, 3000), side: en(b.side, ['left', 'right'], 'left') }); break;
      case 'link': Object.assign(x, { label: ps(b.label, 120), url: safeUrl(b.url), style: en(b.style, ['button', 'outline', 'text'], 'button'), align: al }); break;
      case 'list': Object.assign(x, { text: ps(b.text, 3000), ordered: b.ordered ? 1 : 0 }); break;
      case 'divider': x.style = en(b.style, ['line', 'dots'], 'line'); break;
      case 'spacer': x.size = en(b.size, ['sm', 'md', 'lg'], 'md'); break;
    }
    out.push(x);
  }
  return out;
}
export function plain(blocks) {
  let t = '';
  for (const b of blocks) { if (['text', 'quote', 'split'].includes(b.type)) t += ' ' + (b.text || ''); if (t.length > 400) break; }
  return t.replace(/\s+/g, ' ').trim();
}
export const words = (blocks) => blocks.reduce((n, b) => n + ['text', 'title', 'caption', 'label'].reduce((m, k) => m + (b[k] ? String(b[k]).replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).filter(Boolean).length : 0), 0), 0);
export function slugify(title) {
  let s = title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/, '');
  return (s || 'article') + '-' + crypto.randomBytes(3).toString('hex');
}
/** The designed page as HTML (public website). */
const paras = (t) => t.split(/\n{2,}/).filter((p) => p.trim()).map((p) => '<p>' + esc(p.trim()).replace(/\n/g, '<br>') + '</p>').join('');
export function renderBlocks(blocks) {
  const ib = imgBase(); let o = '';
  for (const b of blocks) {
    const al = ' al-' + esc(b.align || 'left');
    switch (b.type) {
      case 'h1': case 'h2': case 'h3': if (!b.text) break; { const tag = { h1: 'h2', h2: 'h3', h3: 'h4' }[b.type]; o += `<${tag} class="pbk pbk-${b.type}${al} tone-${esc(b.tone)}">${esc(b.text)}</${tag}>`; } break;
      case 'text': if (!b.text) break; o += `<div class="pbk pbk-text${al} sz-${esc(b.size)} st-${esc(b.style)}">${paras(b.text)}</div>`; break;
      case 'quote': if (!b.text) break; o += `<blockquote class="pbk pbk-quote${al}"><p>${esc(b.text).replace(/\n/g, '<br>')}</p>${b.cite ? '<cite>' + esc(b.cite) + '</cite>' : ''}</blockquote>`; break;
      case 'image': if (!b.src) break; o += `<figure class="pbk pbk-img w-${esc(b.width)} al-${esc(b.align)}"><img src="${esc(ib + b.src)}" alt="${esc(b.alt)}" loading="lazy">${b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : ''}</figure>`; break;
      case 'split': if (!b.src && !b.text && !b.title) break; o += `<div class="pbk pbk-split side-${esc(b.side)}">${b.src ? `<figure><img src="${esc(ib + b.src)}" alt="${esc(b.alt)}" loading="lazy"></figure>` : ''}<div>${b.title ? '<h3>' + esc(b.title) + '</h3>' : ''}${paras(b.text)}</div></div>`; break;
      case 'link': if (!b.label || !b.url) break; o += `<p class="pbk pbk-link${al}"><a class="lk-${esc(b.style)}" href="${esc(b.url)}"${/^https?:/i.test(b.url) ? ' target="_blank" rel="noopener noreferrer nofollow"' : ''}>${esc(b.label)}</a></p>`; break;
      case 'list': { const items = b.text.split('\n').map((i) => i.trim()).filter(Boolean); if (!items.length) break; const tag = b.ordered ? 'ol' : 'ul'; o += `<${tag} class="pbk pbk-list">${items.map((i) => '<li>' + esc(i) + '</li>').join('')}</${tag}>`; } break;
      case 'divider': o += `<hr class="pbk pbk-hr hr-${esc(b.style)}">`; break;
      case 'spacer': o += `<div class="pbk pbk-sp sp-${esc(b.size)}" aria-hidden="true"></div>`; break;
    }
  }
  return o;
}
/** Article as the apps need it: cleaned blocks + picture base URL. */
export function articleView(a, withBody = true) {
  const o = { id: a.id, slug: a.slug, title: a.title, excerpt: a.excerpt, cover: a.cover, status: a.status, author_type: a.author_type, author_id: a.author_id, author_name: a.author_name, published_at: a.published_at, created_at: a.created_at, updated_at: a.updated_at };
  if (withBody) { let j = []; try { j = JSON.parse(a.body); } catch { /* empty */ } o.blocks = cleanBlocks(j); }
  return o;
}

// ---- image upload (shared by admin and teacher) ----
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } }).single('file');
export const uploadHandler = (uploaderType) => wrap(async (req, res) => {
  const f = req.file; if (!f) throw new HttpError(400, 'No image was received.');
  const recent = Number(await db.val("select count(*) from pub_media where uploader_type=$1 and uploader_id=$2 and created_at > now() - interval '1 hour'", [uploaderType, req.actor.id]));
  if (recent >= 80) throw new HttpError(429, 'Too many uploads this hour. Please wait a little.');
  let meta; try { meta = await sharp(f.buffer, { limitInputPixels: 40000000 }).metadata(); } catch { throw new HttpError(400, 'Only JPG, PNG, GIF or WebP images are accepted.'); }
  const map = { jpeg: ['jpg', 'image/jpeg'], png: ['png', 'image/png'], gif: ['gif', 'image/gif'], webp: ['webp', 'image/webp'] };
  if (!map[meta.format]) throw new HttpError(400, 'Only JPG, PNG, GIF or WebP images are accepted.');
  const [ext, mime] = map[meta.format]; let buf = f.buffer, w = meta.width, h = meta.height;
  // Re-encoding throws away hidden data in the file and shrinks big photos to a sensible web size.
  if (ext !== 'gif') {
    let p = sharp(f.buffer, { limitInputPixels: 40000000 }).rotate();
    if (w > 1920) p = p.resize({ width: 1920 });
    buf = await (ext === 'jpg' ? p.jpeg({ quality: 82 }) : ext === 'png' ? p.png({ compressionLevel: 6 }) : p.webp({ quality: 82 })).toBuffer();
    const m2 = await sharp(buf).metadata(); w = m2.width; h = m2.height;
  }
  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  await saveImage(name, buf, mime);
  await db.q('insert into pub_media(filename,orig_name,mime,bytes,width,height,uploader_type,uploader_id) values($1,$2,$3,$4,$5,$6,$7,$8)', [name, str(f.originalname.replace(/[^\w .\-]/g, ''), 120), mime, buf.length, w, h, uploaderType, req.actor.id]);
  res.json({ ok: true, name, url: imgBase() + name });
});
