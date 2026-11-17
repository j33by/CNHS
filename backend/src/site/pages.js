import { esc } from '../util.js';
import { config } from '../config.js';
import { imgBase } from '../storage.js';
import { renderBlocks, words, plain } from '../pub.js';
import fs from 'node:fs';
import path from 'node:path';

const V = (() => { try { return Math.floor(fs.statSync(path.resolve('public/assets/style.css')).mtimeMs); } catch { return 1; } })();
const ico = (n) => `<svg class="ico" aria-hidden="true" focusable="false"><use href="/assets/icons.svg#i-${n}"/></svg>`;
const dt = (d, o) => new Intl.DateTimeFormat('en-US', { timeZone: config.tz, ...o }).format(new Date(d));
const longDate = (d) => dt(d, { month: 'long', day: 'numeric', year: 'numeric' });
const isoDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(new Date(d));
export const APP_URL = process.env.APP_DOWNLOAD_URL || '';

export function shell({ title, desc = '', ogImage = '', ogUrl = '', active = '', body, article = false }) {
  const d = esc((desc || 'Articles and news from Calape National High School, Calape, Bohol.').slice(0, 200));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${d}"><meta name="theme-color" content="#f4eee2">
<link rel="icon" type="image/png" href="/assets/logo.png"><link rel="apple-touch-icon" href="/assets/logo.png"><meta property="og:type" content="${article ? 'article' : 'website'}"><meta property="og:site_name" content="Calape National High School"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${d}">
${ogUrl ? `<meta property="og:url" content="${esc(ogUrl)}">` : ''}${ogImage ? `<meta property="og:image" content="${esc(ogImage)}"><meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}
<link rel="preload" href="/assets/fonts/fraunces.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/hanken.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/style.css?v=${V}"><script src="/assets/app.js?v=${V}" defer></script></head><body class="pubsite"><a class="skip" href="#main">Skip to content</a>
<header class="s-head"><div class="s-in s-bar"><a class="s-brand" href="/"><img src="/assets/logo.png" alt="" width="46" height="46"><span><b>Calape National High School</b><small>Calape, Bohol</small></span></a>
<nav class="s-nav" aria-label="Site"><a href="/#about">About</a><a href="/#programs">Programs</a><a href="/#enroll">Enrollment</a><a href="/#news">Announcements</a><a href="/publications"${active === 'pubs' ? ' aria-current="page" class="on"' : ''}>Publications</a><a href="/#contact">Contact</a><a class="s-cta keep" href="/#portals">Get the apps</a></nav></div></header>
<main id="main">${body}</main>
<footer class="s-foot"><div class="s-in"><span>&copy; ${new Date().getFullYear()} Calape National High School. All rights reserved.</span><span><a href="/">Home</a> &middot; <a href="/publications">Publications</a> &middot; <a href="/#portals">Student &amp; teacher apps</a></span></div></footer></body></html>`;
}
export function card(a, big = false) {
  const img = a.cover ? `<img src="${esc(imgBase() + a.cover)}" alt="" loading="lazy">` : `<span class="pc-ph" aria-hidden="true">${esc([...a.title][0]?.toUpperCase() || '')}</span>`;
  const t = a.published_at || a.created_at;
  return `<a class="pcard${big ? ' big' : ''}" href="/publication/${esc(a.slug)}"><span class="pc-img">${img}</span><span class="pc-body"><time datetime="${isoDate(t)}">${longDate(t)}</time><b class="pc-t">${esc(a.title)}</b>${a.excerpt ? `<span class="pc-x">${esc(a.excerpt)}</span>` : ''}<span class="pc-by">By ${esc(a.author_name)}</span></span></a>`;
}
const dl = (label) => (APP_URL ? `<a class="go" href="${esc(APP_URL)}" rel="noopener">${label} ${ico('arrow')}</a>` : `<span class="go">${label}</span>`);

export function homePage(news, pubs) {
  const posts = news.map((n) => `<article class="s-post rv"><time datetime="${isoDate(n.created_at)}"><b>${dt(n.created_at, { day: 'numeric' })}</b>${dt(n.created_at, { month: 'short', year: 'numeric' })}</time><div><h3>${esc(n.title)}</h3><p>${esc(n.body).replace(/\n/g, '<br>')}</p></div></article>`).join('') || '<div class="empty rv">No announcements at this time.</div>';
  const body = `
<section class="s-hero" id="top"><div class="s-in"><div><p class="eyebrow">Calape, Bohol &middot; Since 1990</p><h1>Public secondary education for the families of <mark>Calape</mark>.</h1>
<p class="s-lead">Calape National High School serves learners in Grades 7 to 12, from junior high school through senior high school.</p><div class="acts"><a class="btn pri" href="#portals">Get the apps ${ico('arrow')}</a><a class="btn" href="#enroll">How to enroll</a></div></div>
<div class="s-seal" aria-hidden="true"><i></i><i></i><img src="/assets/logo.png" alt="" width="280" height="280"><span>Founded <b>1990</b></span></div></div></section>
<section class="s-portals" id="portals" aria-label="Apps"><div class="s-in">
<div class="s-pcard">${ico('cap')}<h3>Student app</h3><p>Grades, attendance, schedule and school updates, with notifications on your phone.</p>${dl('Android &middot; sign in with Student ID')}</div>
<div class="s-pcard">${ico('book')}<h3>Teacher app</h3><p>Class records, attendance and announcements.</p>${dl('Android and Windows &middot; Teacher ID')}</div>
<div class="s-pcard">${ico('shield')}<h3>Staff app</h3><p>Enrollment, sections, reports and school records.</p>${dl('Windows &middot; authorized personnel')}</div></div></section>
<section class="s-sec" id="about"><div class="s-in s-split"><div class="rv"><p class="eyebrow">About</p><h2>A school for Calape, run by its own community.</h2></div>
<div class="rv d1"><p>Calape National High School has served the municipality of Calape in the province of Bohol since 1990. Learners are organized by grade level into sections, each guided by a class adviser.</p><p>Enrollment, records and class assignments are managed through the school's apps, so families and teachers work from the same up-to-date information.</p>
<dl class="s-facts"><div><dt>Location</dt><dd>Calape, Bohol</dd></div><div><dt>Founded</dt><dd>1990</dd></div><div><dt>Grade levels</dt><dd>7 to 12</dd></div><div><dt>Grading</dt><dd>Four terms a year</dd></div></dl></div></div></section>
<section class="s-sec" id="programs"><div class="s-in"><div class="rv"><p class="eyebrow">Programs</p><h2>Two stages, one school.</h2></div><div class="s-progs">
<div class="s-prog rv"><span class="no">01</span><h3>Junior High School</h3><p>Grades 7 to 10. Learners are placed in sections by grade level at the start of each school year.</p></div>
<div class="s-prog rv d1"><span class="no">02</span><h3>Senior High School</h3><p>Grades 11 and 12, continuing learners toward graduation.</p></div></div></div></section>
<section class="s-sec" id="enroll"><div class="s-in s-split"><div class="rv"><p class="eyebrow">Enrollment</p><h2>What to bring to the registrar.</h2><p>Enrollment is done in person at the school office.</p></div>
<div class="rv d1"><ol class="s-steps"><li><div><b>Bring the learner's records</b><span>The LRN and the birth record.</span></div></li><li><div><b>Come with a parent or guardian</b><span>See the school registrar to complete the enrollment.</span></div></li><li><div><b>Confirm the schedule</b><span>Check class schedules with the school office.</span></div></li></ol>
<p class="s-note">${ico('id')}<span>Every enrolled learner receives a Student ID number (school year and five digits, like 202627-12345). It is used to sign in to the Student app.</span></p></div></div></section>
<section class="s-sec" id="news"><div class="s-in"><div class="rv"><p class="eyebrow">Announcements</p><h2>From the school office.</h2></div><div class="s-news">${posts}</div></div></section>
${pubs.length ? `<section class="s-sec" id="publications"><div class="s-in"><div class="rv"><p class="eyebrow">Publications</p><h2>Latest articles.</h2></div><div class="pub-grid">${pubs.map((a) => card(a)).join('')}</div><p class="pub-all"><a class="btn" href="/publications">All publications ${ico('arrow')}</a></p></div></section>` : ''}
<section class="s-sec" id="contact"><div class="s-in"><div class="rv"><p class="eyebrow">Contact</p><h2>Find us.</h2></div><div class="s-contact"><div class="rv">${ico('pin')}<b>Address</b>Calape National High School<br>Calape, Bohol, Philippines</div><div class="rv d1">${ico('mega')}<b>Email</b><a href="mailto:calapenhs@gmail.com">calapenhs@gmail.com</a></div></div></div></section>`;
  return shell({ title: 'Calape National High School | Calape, Bohol', desc: 'Public secondary education for the families of Calape. Junior and Senior High School, founded 1990.', ogImage: (config.siteUrl || '') + '/assets/logo.png', ogUrl: config.siteUrl + '/', body });
}
export function pubsPage({ q, page, per, total, recent, rest, down }) {
  const pages = Math.ceil(total / per), qs = (p) => `?${q ? 'q=' + encodeURIComponent(q) + '&' : ''}p=${p}`;
  const pager = pages > 1 ? `<nav class="pager" aria-label="Pages">${page > 1 ? `<a href="${qs(page - 1)}" rel="prev">Previous</a>` : ''}${Array.from({ length: Math.min(pages, page + 3) - Math.max(1, page - 3) + 1 }, (_, i) => Math.max(1, page - 3) + i).map((i) => (i === page ? `<b aria-current="page">${i}</b>` : `<a href="${qs(i)}">${i}</a>`)).join('')}${page < pages ? `<a href="${qs(page + 1)}" rel="next">Next</a>` : ''}</nav>` : '';
  let b = `<section class="pub-hero"><div class="s-in"><p class="eyebrow">Calape National High School</p><h1>Publications</h1><p class="s-lead">Articles, features and news from our faculty and staff. Anyone can read them, no sign-in needed.</p><form class="pub-search" method="get" role="search"><input type="search" name="q" value="${esc(q)}" placeholder="Search publications" aria-label="Search publications" maxlength="80"><button class="btn pri">Search</button>${q ? '<a class="btn" href="/publications">Clear</a>' : ''}</form></div></section><div class="s-in pub-wrap">`;
  if (down) b += '<div class="empty">Publications are not available right now. Please check back soon.</div>';
  else {
    if (recent.length) b += `<section aria-labelledby="rec"><h2 class="pub-h" id="rec">Recent publications</h2><div class="pub-feature">${recent.map((a, i) => card(a, i === 0)).join('')}</div></section>`;
    if (q || rest.length) b += `<section aria-labelledby="prev"><h2 class="pub-h" id="prev">${q ? `Results for &ldquo;${esc(q)}&rdquo; (${total})` : 'Previous publications'}</h2><div class="pub-grid">${rest.map((a) => card(a)).join('')}</div>${!rest.length ? '<div class="empty">No publications match your search.</div>' : ''}${pager}</section>`;
    if (!q && !recent.length && !rest.length) b += '<div class="empty">No publications yet. Check back soon.</div>';
  }
  return shell({ title: 'Publications | Calape National High School', desc: 'Articles, features and news written by the faculty and staff of Calape National High School.', active: 'pubs', body: b + '</div>' });
}
export function articlePage(a, blocks, rxTotal, recent, prev) {
  const t = a.published_at || a.created_at, mins = Math.max(1, Math.ceil(words(blocks) / 200)), url = `${config.siteUrl}/publication/${a.slug}`;
  let b = `<article class="pub-article"><header class="pub-ah"><div class="s-in narrow"><p class="eyebrow"><a href="/publications">&larr; Publications</a></p><h1>${esc(a.title)}</h1>${a.excerpt ? `<p class="pub-sum">${esc(a.excerpt)}</p>` : ''}<p class="pub-meta"><span>By <b>${esc(a.author_name)}</b></span><time datetime="${isoDate(t)}">${longDate(t)}</time><span>${mins} min read</span>${rxTotal ? `<span>${rxTotal} reaction${rxTotal === 1 ? '' : 's'}</span>` : ''}</p></div></header>`;
  if (a.cover) b += `<div class="s-in narrow wide"><figure class="pub-cover"><img src="${esc(imgBase() + a.cover)}" alt=""></figure></div>`;
  b += `<div class="s-in narrow"><div class="pbody">${renderBlocks(blocks)}</div><div class="pub-share"><span>Share this article. Students and teachers can react to it when signed in to their app.</span><code id="shareUrl">${esc(url)}</code><button type="button" class="btn sm" data-copy="#shareUrl">Copy link</button></div></div></article><div class="s-in pub-wrap">`;
  if (recent.length) b += `<section aria-labelledby="rec"><h2 class="pub-h" id="rec">Recent publications</h2><div class="pub-feature">${recent.map((r, i) => card(r, i === 0)).join('')}</div></section>`;
  if (prev.length) b += `<section aria-labelledby="prev"><h2 class="pub-h" id="prev">Previous publications</h2><div class="pub-grid">${prev.map((r) => card(r)).join('')}</div></section>`;
  return shell({ title: `${a.title} | Calape National High School`, desc: a.excerpt || plain(blocks), ogImage: a.cover ? imgBase() + a.cover : '', ogUrl: url, active: 'pubs', article: true, body: b + '</div>' });
}
export const notFoundPage = (down) => shell({ title: down ? 'Publications unavailable | CNHS' : 'Article not found | CNHS', active: 'pubs', body: `<div class="s-in pub-wrap"><div class="empty">${down ? 'Publications are not available right now. Please try again later.' : 'This article was not found. It may have been removed or is not published.'}</div><p><a class="btn" href="/publications">All publications</a></p></div>` });
