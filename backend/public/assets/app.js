/* CNHS Portal — shared behaviour. No inline scripts are used anywhere (the CSP forbids them). */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  root.classList.add('js');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || d).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); };

  /* ---- Clicks: dialogs, confirm, print, copy, drawer ---- */
  d.addEventListener('click', function (e) {
    var t = e.target;
    var o = t.closest('[data-open]');
    if (o) { var dlg = d.getElementById(o.dataset.open); if (dlg && dlg.showModal) dlg.showModal(); }
    var c = t.closest('[data-close]');
    if (c) c.closest('dialog').close();
    var f = t.closest('[data-confirm]');
    if (f && !confirm(f.dataset.confirm)) { e.preventDefault(); return; }
    if (t.closest('[data-print]')) window.print();
    var cp = t.closest('[data-copy]');
    if (cp) {
      var src = $(cp.dataset.copy);
      if (src) copyText(src.textContent.trim(), cp);
    }
    if (t.closest('[data-nav-toggle]')) setNav(!$('#side').classList.contains('open'));
    if (t.closest('[data-nav-close]')) setNav(false);
    if (t.closest('.side nav a')) setNav(false);
  });
  d.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });

  function setNav(open) {
    var side = $('#side'); if (!side) return;
    side.classList.toggle('open', open);
    var sc = $('.scrim'); if (sc) sc.classList.toggle('on', open);
    var b = $('[data-nav-toggle]'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
    d.body.style.overflow = open ? 'hidden' : '';
  }
  function toast(msg) {
    var n = d.createElement('div'); n.className = 'toast'; n.setAttribute('role', 'status'); n.textContent = msg;
    d.body.appendChild(n); setTimeout(function () { n.remove(); }, 1800);
  }
  function copyText(text, btn) {
    var done = function () { toast('Copied'); };
    if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
    function fallback() {
      var ta = d.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'toast'; d.body.appendChild(ta);
      ta.select(); try { d.execCommand('copy'); done(); } catch (x) { toast('Press Ctrl+C to copy'); } ta.remove();
    }
  }

  /* ---- Undo notification after a delete: counts down, then goes away. Hover or focus pauses it. ---- */
  (function () {
    var u = $('.undo'); if (!u) return;
    var left = parseInt(u.dataset.secs, 10) || 12, cnt = $('.undo-count', u), paused = false;
    var tick = setInterval(function () {
      if (paused) return;
      left--; if (cnt) cnt.textContent = Math.max(left, 0);
      if (left <= 0) close();
    }, 1000);
    function close() { clearInterval(tick); u.remove(); }
    u.addEventListener('mouseenter', function () { paused = true; });
    u.addEventListener('mouseleave', function () { paused = false; });
    u.addEventListener('focusin', function () { paused = true; });
    u.addEventListener('focusout', function () { paused = false; });
    u.addEventListener('click', function (e) { if (e.target.closest('[data-undo-close]')) close(); });
  })();

  /* ---- Grids (teacher attendance and class record) ---- */
  var dirty = false;
  function markDirty(el) { dirty = true; var m = el && el.closest('form') && el.closest('form').querySelector('[data-dirtymsg]'); if (m) m.hidden = false; }
  d.addEventListener('input', function (e) { if (e.target.closest && e.target.closest('table.rec')) markDirty(e.target); });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  var ORDER = ['P', 'A', 'L', 'E'], NAMES = { P: 'Present', A: 'Absent', L: 'Late', E: 'Excused', '': 'Not marked' };
  function setCell(btn, v) {
    var inp = btn.nextElementSibling; inp.value = v;
    btn.textContent = v || '\u00b7'; btn.title = NAMES[v];
    btn.className = btn.className.replace(/\bs-\w+/, 's-' + (v || 'none'));
    markDirty(btn);
  }
  function stepCell(btn, by) {
    var cur = ORDER.indexOf(btn.nextElementSibling.value);
    setCell(btn, ORDER[(cur + by + ORDER.length * 2) % ORDER.length]);
  }
  d.addEventListener('click', function (e) {
    var t = e.target, cell = t.closest('[data-cycle]');
    if (cell) { if (e.detail < 2) stepCell(cell, 1); return; }
    var ap = t.closest('[data-allp]');
    if (ap) {
      var i = ap.closest('th').cellIndex;
      $$('tbody tr[data-sid]', ap.closest('table')).forEach(function (tr) { var b = $('.cell', tr.cells[i]); if (b) setCell(b, 'P'); });
      return;
    }
    var rm = t.closest('[data-rmcol]');
    if (rm) {
      var tbl = rm.closest('table'), idx = rm.closest('th').cellIndex;
      $$('tr', tbl).forEach(function (tr) { if (tr.cells[idx]) tr.deleteCell(idx); });
      return;
    }
    var add = t.closest('[data-add-date]');
    if (add) addDateColumn(add);
    var more = t.closest('[data-more]');
    if (more) {
      var step = parseInt(more.dataset.more, 10), hid = $$('.cmt.later:not(.shown)', more.parentNode);
      hid.slice(0, step).forEach(function (x) { x.classList.add('shown'); });
      var left = hid.length - step; if (left <= 0) more.remove(); else $('span', more).textContent = left;
    }
    var ec = t.closest('[data-edit-col]');
    if (ec) {
      $('#ecId').value = ec.dataset.id; $('#ecTitle').value = ec.dataset.title; $('#ecDate').value = ec.dataset.date; $('#ecMax').value = ec.dataset.max; $('#ecW').value = ec.dataset.weight;
      $('#editCol').showModal();
    }
  });
  d.addEventListener('dblclick', function (e) {
    var cell = e.target.closest('[data-cycle]'); if (!cell) return;
    stepCell(cell, -1);   // undo the step the first click made
    var dlg = $('#noteDlg'), rm = cell.nextElementSibling.nextElementSibling, tr = cell.closest('tr');
    $('#noteWho').textContent = tr.querySelector('.nm').textContent.replace(/^\d+/, '') + ' - ' + (cell.closest('table').tHead.rows[0].cells[cell.closest('td').cellIndex].textContent.replace(/\s+/g, ' ').trim());
    var txt = $('#noteTxt'); txt.value = rm.value;
    dlg.returnValue = ''; dlg.onclose = function () { if (dlg.returnValue === 'ok') { rm.value = txt.value.trim(); cell.classList.toggle('has-note', rm.value !== ''); markDirty(cell); } };
    dlg.showModal(); txt.focus();
  });
  function addDateColumn(btn) {
    var grid = btn.closest('[data-attgrid]'), tbl = btn.closest('table'), hr = tbl.tHead.rows[0], plus = $('th.plus', hr);
    var used = $$('input[name^="d["]', hr).map(function (x) { return x.value; });
    var day = new Date(grid.dataset.today + 'T00:00:00'), iso;
    for (var n = 0; n < 90; n++, day.setDate(day.getDate() - 1)) {
      iso = day.getFullYear() + '-' + String(day.getMonth() + 1).padStart(2, '0') + '-' + String(day.getDate()).padStart(2, '0');
      if (day.getDay() !== 0 && day.getDay() !== 6 && used.indexOf(iso) < 0) break;
    }
    var k = (grid.dataset.next = String((parseInt(grid.dataset.next || '100', 10)) + 1));
    var th = d.createElement('th'); th.className = 'dcol fresh';
    th.innerHTML = '<input type="date" name="d[' + k + ']" required max="' + grid.dataset.today + '" value="' + iso + '" aria-label="Date of new column"><span class="dtools noprint"><button type="button" class="mini" data-allp title="Mark everyone present">All P</button><button type="button" class="mini x" data-rmcol title="Discard this column" aria-label="Discard this column"><svg class="ico" aria-hidden="true"><use href="' + base + 'icons.svg#i-x"/></svg></button></span>';
    hr.insertBefore(th, plus);
    $$('tbody tr[data-sid]', tbl).forEach(function (tr) {
      var td = d.createElement('td'); td.className = 'ac fresh'; var sid = tr.dataset.sid;
      td.innerHTML = '<button type="button" class="cell s-P" data-cycle title="Present">P</button><input type="hidden" name="st[' + k + '][' + sid + ']" value="P"><input type="hidden" name="rm[' + k + '][' + sid + ']" value="">';
      tr.insertBefore(td, $('td.plus', tr));
    });
    var empty = $('.empty', grid); if (empty && empty.closest('.pb')) empty.closest('.pb').remove();
    markDirty(btn); th.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    $('input', th).focus({ preventScroll: true });
  }

  /* ---- Number count-up on dashboards ---- */
  $$('[data-count]').forEach(function (el) {
    var end = parseInt(el.dataset.count, 10);
    if (reduce || isNaN(end) || end < 2) return;
    var start = null, dur = 700;
    el.textContent = '0';
    requestAnimationFrame(function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * eased).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(step); else el.textContent = end.toLocaleString('en-US');
    });
  });

  /* ---- Show/hide password + caps-lock warning ---- */
  var eye = '<svg class="ico" aria-hidden="true"><use href="{B}icons.svg#i-eye"/></svg>';
  var base = (function () { var l = $('link[rel=stylesheet][href*="style.css"]'); return l ? l.getAttribute('href').replace(/style\.css.*$/, '') : '../assets/'; })();
  $$('input[type=password]').forEach(function (inp) {
    var wrap = d.createElement('span'); wrap.className = 'pwwrap';
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    var b = d.createElement('button'); b.type = 'button'; b.className = 'pwbtn'; b.setAttribute('aria-label', 'Show password'); b.innerHTML = eye.replace('{B}', base);
    wrap.appendChild(b);
    var w = d.createElement('em'); w.className = 'caps'; w.textContent = 'Caps Lock is on'; wrap.parentNode.appendChild(w);
    b.addEventListener('click', function () {
      var show = inp.type === 'password'; inp.type = show ? 'text' : 'password';
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      b.innerHTML = (show ? eye.replace('i-eye', 'i-eyeoff') : eye).replace('{B}', base);
    });
    var caps = function (e) { if (e.getModifierState) w.classList.toggle('on', e.getModifierState('CapsLock')); };
    inp.addEventListener('keydown', caps); inp.addEventListener('keyup', caps); inp.addEventListener('blur', function () { w.classList.remove('on'); });
  });

  /* ---- Sign-in ID boxes: add the hyphen for the person ---- */
  $$('[data-idmask]').forEach(function (inp) {
    var kind = inp.dataset.idmask;
    inp.addEventListener('input', function () {
      var v = inp.value, digits = v.replace(/\D/g, '');
      if (kind === 'student') { digits = digits.slice(0, 11); inp.value = digits.length > 6 ? digits.slice(0, 6) + '-' + digits.slice(6) : digits; }
      else { digits = digits.slice(0, 5); inp.value = (v.trim() === '' && digits === '') ? '' : 'T-' + digits; }
    });
    inp.addEventListener('focus', function () { if (kind === 'teacher' && inp.value === '') inp.value = 'T-'; });
    inp.addEventListener('blur', function () { if (kind === 'teacher' && inp.value === 'T-') inp.value = ''; });
  });

  /* ---- Double-submit guard + working state on forms ---- */
  d.addEventListener('submit', function (e) {
    var f = e.target; if (!(f instanceof HTMLFormElement) || e.defaultPrevented) return;
    if (f.dataset.busy) { e.preventDefault(); return; }
    if (f.method && f.method.toLowerCase() !== 'post') return;
    f.dataset.busy = '1';
    dirty = false;
    var b = e.submitter || f.querySelector('button:not([type=button]),[type=submit]'); if (b) b.classList.add('loading');
    setTimeout(function () { delete f.dataset.busy; if (b) b.classList.remove('loading'); }, 8000);
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) $$('form').forEach(function (f) { delete f.dataset.busy; $$('.loading', f).forEach(function (b) { b.classList.remove('loading'); }); }); });

  /* ---- Section creator (admin/sections.php) ---- */
  var n = $('#secCount');
  if (n) {
    var box = $('#secNames'), g = $('#secGrade');
    var draw = function () {
      var k = Math.max(0, Math.min(20, parseInt(n.value, 10) || 0)); box.innerHTML = '';
      for (var i = 1; i <= k; i++) {
        var l = d.createElement('label'); l.className = 'f';
        var s = d.createElement('span'); s.textContent = 'Section ' + i + ' name';
        var t = d.createElement('input'); t.name = 'names[]'; t.required = true; t.maxLength = 40; t.placeholder = 'e.g. Grade ' + g.value + ' - Name';
        l.appendChild(s); l.appendChild(t); box.appendChild(l);
      }
    };
    n.addEventListener('input', draw); g.addEventListener('change', draw); draw();
  }

  /* ---- Idle sign-out warning (signed-in pages only) ---- */
  var idle = parseInt(d.body.dataset.idle || '0', 10), ping = d.body.dataset.ping, bar = $('#idlebar');
  if (idle && bar && ping) {
    var last = Date.now(), warnAt = (idle - 120) * 1000, timer;
    var arm = function () {
      clearTimeout(timer); bar.hidden = true; last = Date.now();
      timer = setTimeout(function () { bar.hidden = false; }, warnAt);
    };
    var activity = (function () { var t = 0; return function () { var now = Date.now(); if (now - t > 5000 && bar.hidden) { t = now; arm(); } }; })();
    ['pointerdown', 'keydown', 'scroll'].forEach(function (ev) { addEventListener(ev, activity, { passive: true }); });
    var stay = $('[data-stay]', bar);
    if (stay) stay.addEventListener('click', function () {
      fetch(ping, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { if (r.status === 204) arm(); else location.reload(); }, function () { location.reload(); });
    });
    arm();
  }

  /* ---- Public site: header shadow + reveal on scroll ---- */
  var head = $('.s-head');
  if (head) {
    var onScroll = function () { head.classList.toggle('stuck', window.scrollY > 8); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
  var rv = $$('.rv');
  if (rv.length) {
    if ('IntersectionObserver' in window && !reduce) {
      var io = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }); }, { threshold: .12, rootMargin: '0px 0px -40px 0px' });
      rv.forEach(function (el) { io.observe(el); });
    } else rv.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---- Emoji reactions: little burst, then send ---- */
  $$('form.rxn').forEach(function (f) {
    f.addEventListener('click', function (e) {
      var b = e.target.closest('button.rx'); if (!b || reduce || b.dataset.go) return;
      e.preventDefault(); b.dataset.go = '1'; b.classList.add('rx-go');
      var em = $('.rx-e', b), ch = em ? em.textContent : '';
      var dirs = [[-34,-34],[0,-44],[34,-34],[-44,-6],[44,-6],[-22,-48],[22,-48]];
      dirs.forEach(function (v, i) {
        var p = d.createElement('span'); p.className = 'rx-p'; p.textContent = ch; p.setAttribute('aria-hidden', 'true');
        p.style.setProperty('--dx', v[0] + 'px'); p.style.setProperty('--dy', v[1] + 'px'); p.style.setProperty('--rot', (i % 2 ? 40 : -40) + 'deg');
        b.appendChild(p);
      });
      setTimeout(function () { if (f.requestSubmit) f.requestSubmit(b); else { b.dataset.go = ''; b.click(); } }, 520);
    });
  });
})();