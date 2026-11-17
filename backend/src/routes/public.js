import { Router } from 'express';
import { db } from '../db.js';
import { wrap, str, int } from '../util.js';
import { pubList, pubCount } from './common.js';
import { cleanBlocks } from '../pub.js';
import { homePage, pubsPage, articlePage, notFoundPage } from '../site/pages.js';

export const site = Router();
const cache = (s) => (req, res, next) => { res.set('Cache-Control', `public, max-age=${s}`); next(); };
site.get('/', cache(60), wrap(async (req, res) => {
  const news = await db.rows("select title,body,created_at from notices where is_public=true and is_deleted=false and audience='all' order by id desc limit 5").catch(() => []);
  const pubs = await pubList(3).catch(() => []);
  res.type('html').send(homePage(news, pubs));
}));
site.get('/publications', cache(60), wrap(async (req, res) => {
  const q = str(req.query.q, 80), page = Math.max(1, int(req.query.p, 1)), per = 12, featN = 3;
  try {
    let recent = [], rest, total;
    if (!q) { if (page === 1) recent = await pubList(featN); total = Math.max(0, (await pubCount()) - featN); rest = await pubList(per, featN + (page - 1) * per); }
    else { total = await pubCount(q); rest = await pubList(per, (page - 1) * per, 0, q); }
    res.type('html').send(pubsPage({ q, page, per, total, recent, rest, down: false }));
  } catch (e) { console.error(e.message); res.status(503).type('html').send(pubsPage({ q, page, per, total: 0, recent: [], rest: [], down: true })); }
}));
const article = wrap(async (req, res) => {
  const slug = String(req.params.slug || req.query.s || '');
  if (!/^[a-z0-9-]{3,90}$/.test(slug)) return res.status(404).type('html').send(notFoundPage(false));
  try {
    const a = await db.one("select * from pub_articles where slug=$1 and status='published' and is_deleted=false", [slug]);
    if (!a) return res.status(404).type('html').send(notFoundPage(false));
    const rx = Number(await db.val('select count(*) from pub_reactions where article_id=$1', [a.id])), recent = await pubList(3, 0, a.id), ids = recent.map((r) => r.id);
    const prev = (await pubList(9, 3, a.id)).filter((r) => !ids.includes(r.id));
    let j = []; try { j = JSON.parse(a.body); } catch { /* empty */ }
    res.set('Cache-Control', 'public, max-age=60').type('html').send(articlePage(a, cleanBlocks(j), rx, recent, prev));
  } catch (e) { console.error(e.message); res.status(503).type('html').send(notFoundPage(true)); }
});
site.get('/publication/:slug', article);
site.get('/publication.php', article); // old links keep working

/* Public JSON (no sign-in) */
export const publicApi = Router();
publicApi.get('/publications', wrap(async (req, res) => { const rows = await pubList(12, (Math.max(1, int(req.query.p, 1)) - 1) * 12, 0, str(req.query.q, 80)); res.json({ ok: true, rows }); }));
publicApi.get('/health', (req, res) => res.json({ ok: true }));
