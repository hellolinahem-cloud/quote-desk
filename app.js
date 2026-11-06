/* Quote Desk – web app (PWA). Talks to the Quote Desk API (Apps Script). */
(function () {
'use strict';
const CFG = window.QD_CONFIG || {};
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad = (n) => String(n).padStart(2, '0');
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); })();
const dnum = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const days = (a, b) => Math.round((dnum(b) - dnum(a)) / 86400000);
const addDays = (s, n) => new Date(dnum(s) + n * 86400000).toISOString().slice(0, 10);
const fmt = (s) => { if (!s) return '–'; const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return +s.slice(8, 10) + ' ' + m[+s.slice(5, 7) - 1]; };
const ceil0 = (x) => Math.ceil(Math.round(x * 1e6) / 1e6);
const CHK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>';
const XI = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };

const S = {
  demo: false, token: store.get('qd_token'), user: null,
  deals: [], inbox: [], view: 'today', sel: null, open: {}, busy: {}, msgs: [],
  chat: window.innerWidth < 860 ? 'min' : 'dock', dockW: 360, pop: { x: 0, y: 70, w: 380, h: 540 }, undo: null, installEvt: null
};

/* ---------- API ---------- */
async function api(action, data) {
  if (!CFG.API_URL) throw new Error('API URL is missing in config.js.');
  const res = await fetch(CFG.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action, token: S.token }, data || {})) });
  let out;
  try { out = await res.json(); } catch (e) { throw new Error('Server did not answer. Check your connection.'); }
  if (!out.ok) {
    if (/sign in|session/i.test(out.error || '')) { signOut(true); }
    throw new Error(out.error || 'Something went wrong.');
  }
  return out.data;
}

/* ---------- formulas (same as the SPR sheet and the server) ---------- */
function calc(deal) {
  const p = deal.pricing || {}; const cmPct = (+p.cm || 0) / 100; const cats = {};
  let sales = 0, purchase = 0, cm = 0;
  (deal.lines || []).forEach((l) => {
    l._st = 0; if (l.inc === false) return;
    const cu = l.wht ? l.cost / 0.86 : +l.cost; const su = ceil0(cu * (1 + (+(p.mk || {})[l.cat] || 0) / 100));
    const st = su * l.qty, ct = cu * l.qty; l._st = st;
    const c = cats[l.cat] || (cats[l.cat] = { cost: 0, sell: 0 }); c.cost += ct; c.sell += st;
    sales += st; purchase += ct; cm += Math.round(st * cmPct);
  });
  const ship = +p.ship || 0; const gp = sales - purchase - ship - cm;
  return { cats, sales, purchase, cm, ship, gp, gpp: sales ? gp / sales * 100 : 0, vat: sales * 0.1, total: sales * 1.1 };
}
window.QDCalc = calc;

/* ---------- deal logic ---------- */
const byId = (id) => S.deals.find((x) => x.id === id);
const cost = (x) => { const c = x.costing || []; const w = c.filter((k) => k.status === 'waiting'); return { waiting: w, all: !w.length && c.length > 0, got: c.length - w.length, total: c.length, est: c.filter((k) => k.status === 'estimate') }; };
function curStep(x) { const d = x.d || {}; if (!d.priceRcv) return 0; if (!d.drafted) return 1; if (!d.approved) return 2; if (!d.released) return 3; return 4; }
function next(x) {
  const s = curStep(x), c = cost(x), d = x.d || {}; const wt = c.waiting.map((w) => w.n).join(', ');
  if (x.outcome) return { text: x.outcome === 'won' ? 'Won' : 'Lost', grp: 'closed' };
  if (s === 0) {
    if (!d.priceReq) return { text: 'Request price from ' + (x.supplier || 'supplier'), act: 'priceReq', label: 'Request price', grp: 'ready' };
    if (c.all) return { text: 'Costs complete', act: 'qb', label: 'Build quote', grp: 'ready' };
    if (x.followUp && x.followUp <= TODAY) { const o = days(x.followUp, TODAY); return { text: 'Follow up: ' + wt + (o > 0 ? ' · ' + o + 'd overdue' : ' · due today'), tone: 'red', act: 'follow', label: 'Follow up', grp: 'now' }; }
    return { text: 'Waiting: ' + (wt || 'costing'), sub: x.followUp ? 'Follow-up ' + fmt(x.followUp) : '', act: 'follow', label: 'Follow up', grp: 'wait' };
  }
  if (s === 1) return { text: 'Build GP & quotation', act: 'qb', label: 'Build quote', grp: 'ready' };
  if (s === 2) { if (!d.approvalReq) return { text: 'Send for approval – ' + (x.approver || 'approver'), act: 'approvalReq', label: 'Send for approval', grp: 'ready' };
    const w = days(d.approvalReq, TODAY); return { text: 'Waiting approval · ' + w + ' days', tone: w >= 7 ? 'amber' : '', act: 'approved', label: 'Mark approved', grp: 'wait' }; }
  if (s === 3) return { text: 'Release quote to ' + (x.sales || 'Sales'), act: 'released', label: 'Release', grp: 'ready' };
  const due = x.custFollow && x.custFollow <= TODAY;
  return { text: due ? 'Follow up customer with ' + (x.sales || 'Sales') : 'With customer', sub: due || !x.custFollow ? '' : 'Follow-up ' + fmt(x.custFollow), tone: due ? 'red' : '', act: 'custFollow', label: 'Log follow-up', grp: due ? 'now' : 'wait' };
}
function urgent(x) { const n = next(x); if (n.grp === 'now') return true; if (x.deadline && curStep(x) < 3 && !x.outcome && days(TODAY, x.deadline) <= 2) return true; return false; }
function dl(x) { if (!x.deadline || curStep(x) >= 4 || x.outcome) return ''; const n = days(TODAY, x.deadline);
  const t = n < 0 ? (-n) + 'd late' : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : 'Due ' + fmt(x.deadline);
  return '<span class="chip ' + (n <= 2 ? 'red' : n <= 5 ? 'amber' : '') + '">' + t + '</span>'; }
function log(x, t) { x.log = x.log || []; x.log.unshift({ d: TODAY, t, by: S.user ? S.user.name : '' }); }

/* ---------- save with undo ---------- */
let saveTimers = {}; const saveQ = {};
function saveDeal(x, msg, opts) {
  opts = opts || {};
  saveQ[x.id] = (saveQ[x.id] || Promise.resolve()).then(async () => {
    try {
      const saved = await api('deals.save', { deal: x });
      const cur = byId(saved.id);
      if (cur) cur.version = saved.version; else S.deals.push(saved);
      if (!opts.quiet) render();
      if (msg) toast(msg, !!opts.undo);
      return saved;
    } catch (e) { toast(e.message); await loadAll(); }
  });
  return saveQ[x.id];
}
function mutate(x, fn, msg) {
  const before = clone(x); fn(x); render();
  S.undo = async () => { const cur = byId(before.id); before.version = cur ? cur.version : before.version; Object.assign(cur, before); render(); await saveDeal(cur, 'Undone'); };
  return saveDeal(x, msg, { undo: true });
}
function saveSoon(x) { clearTimeout(saveTimers[x.id]); saveTimers[x.id] = setTimeout(() => { delete saveTimers[x.id]; saveDeal(x, null, { quiet: true }); }, 700); }

/* ---------- actions ---------- */
function act(a, x) {
  const w = cost(x).waiting.map((k) => k.n).join(', ');
  if (a === 'qb') { if (!x.d.priceRcv && cost(x).all) { x.d.priceRcv = TODAY; saveSoon(x); } openDeal(x.id); return; }
  if (a === 'priceReq') { mutate(x, () => { x.d.priceReq = TODAY; x.followUp = addDays(TODAY, 2); log(x, 'Price requested from ' + x.supplier); }, 'Price requested – follow-up ' + fmt(addDays(TODAY, 2))); email('rfq', x); }
  else if (a === 'follow') { mutate(x, () => { x.followUp = addDays(TODAY, 2); log(x, 'Followed up: ' + (w || 'pricing')); }, 'Follow-up logged – next ' + fmt(addDays(TODAY, 2))); email('follow', x); }
  else if (a === 'approvalReq') { mutate(x, () => { x.d.approvalReq = TODAY; log(x, 'Sent for approval – ' + x.approver); }, 'Sent for approval'); email('approval', x); }
  else if (a === 'approved') mutate(x, () => { x.d.approved = TODAY; log(x, 'Approved'); }, 'Approved – next: release to ' + (x.sales || 'Sales'));
  else if (a === 'released') { mutate(x, () => { x.d.released = TODAY; x.custFollow = addDays(TODAY, 3); log(x, 'Released to ' + (x.sales || 'Sales')); }, 'Released – customer follow-up ' + fmt(addDays(TODAY, 3))); email('release', x); }
  else if (a === 'custFollow') mutate(x, () => { x.custFollow = addDays(TODAY, 3); log(x, 'Customer follow-up logged'); }, 'Next customer follow-up ' + fmt(addDays(TODAY, 3)));
  else if (a === 'markDrafted') mutate(x, () => { x.d.drafted = TODAY; log(x, 'Quote drafted'); }, 'Quote marked drafted');
}
function openDeal(id) { S.view = 'deal'; S.sel = id; render(); $('#main').scrollTop = 0; }

/* ---------- email drafts ---------- */
function email(k, x) {
  const w = cost(x).waiting.map((c) => c.n).join(', '); const me = S.user ? S.user.name : 'Lina'; let to, cc, sub, body;
  const sig = '\n\nThank you,\n' + me + '\nBusiness Development – Biplan Global';
  if (k === 'rfq') { to = '[' + x.supplier + ' contact]'; cc = x.sales || '[Sales owner]'; sub = 'RFQ – ' + x.customer + ' – ' + x.project; body = 'Dear team,\n\nPlease kindly quote your best price for the attached BOQ for ' + x.customer + ' (' + x.project + ').\nPlease include unit price, validity, Incoterm, lead time, warranty and deal registration status.' + sig; }
  else if (k === 'follow') { to = '[' + x.supplier + ' contact]'; cc = x.sales || '[Sales owner]'; sub = 'Follow-up: ' + x.customer + ' – ' + x.project + ' pricing';
    body = 'Dear team,\n\nFollowing up on our price request for ' + x.customer + ' (' + x.project + ')' + (x.d.priceReq ? ' sent on ' + fmt(x.d.priceReq) : '') + '.\nStill pending: ' + (w || 'pricing') + '.\n' +
      (x.deadline ? 'Our customer deadline is ' + fmt(x.deadline) + ' – could you please share it by ' + fmt(addDays(TODAY, 1)) + '?' : 'Could you please share an update by ' + fmt(addDays(TODAY, 1)) + '?') + sig; }
  else if (k === 'approval') { const g = x.generated; to = x.approver; cc = x.sales || '[Sales owner]'; sub = 'Verify Quotation – ' + x.customer + ' – ' + x.project;
    body = 'Dear Bong,\n\nPlease help verify the quotation for ' + x.customer + ' – ' + x.project + '.\n' + (g ? '\nSales excl. VAT: ' + money(g.sales) + '\nGP: ' + money(g.gp) + ' (' + Number(g.gpp).toFixed(1) + '%)\nTotal incl. VAT: ' + money(g.total) + '\n' : '') +
      (g && g.folderUrl && g.folderUrl !== '#' ? '\nFolder: ' + g.folderUrl + '\n' : '\nSPR and quotation are in the deal folder.\n') + sig; }
  else { to = x.sales || '[Sales owner]'; cc = ''; sub = 'Quotation ready – ' + x.customer + ' – ' + x.project; body = 'Hi ' + (x.sales ? x.sales.split(' ')[0] : '') + ',\n\nThe approved quotation for ' + x.customer + ' – ' + x.project + ' is ready' + (x.generated && x.generated.quoteUrl && x.generated.quoteUrl !== '#' ? ': ' + x.generated.quoteUrl : ' in the deal folder') + '.\nPlease send it to the customer and share their feedback.' + sig; }
  modal('<div class="row" style="justify-content:space-between"><h2>Email draft – not sent</h2><button class="ibtn" data-act="mclose" aria-label="Close">' + XI + '</button></div><pre id="etext">' + esc('To: ' + to + '\nCc: ' + cc + '\nSubject: ' + sub + '\n\n' + body) + '</pre><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="mclose">Close</button><button class="btn primary" data-act="copy">Copy</button></div>');
}

/* ---------- views: today ---------- */
function dcard(x) { const n = next(x);
  return '<div class="card dcard" data-open="' + x.id + '"><div class="who"><button class="title" data-open="' + x.id + '">' + esc(x.customer) + ' <span class="muted" style="font-weight:400">· ' + esc(x.project) + '</span></button>' +
    '<div class="next"><span class="' + (n.tone === 'red' ? 't-red' : n.tone === 'amber' ? 't-amber' : '') + '">' + esc(n.text) + '</span>' + (n.sub ? ' <span class="muted">· ' + esc(n.sub) + '</span>' : '') + '</div></div>' +
    dl(x) + (n.act ? '<button class="btn sm ' + (urgent(x) ? 'primary' : n.grp === 'ready' ? 'ok' : '') + '" data-do="' + n.act + '" data-id="' + x.id + '">' + n.label + '</button>' : '') + '</div>'; }
function section(title, color, list, empty) {
  return '<div class="sec"><div class="sechead"><span class="n" style="background:' + color + '">' + list.length + '</span><h2>' + title + '</h2></div><div class="cards">' + (list.map(dcard).join('') || '<p class="muted">' + empty + '</p>') + '</div></div>'; }
function viewToday() {
  const open = S.deals.filter((x) => !x.outcome); const sortD = (a, b) => ((a.deadline || '9') < (b.deadline || '9') ? -1 : 1);
  const now = open.filter(urgent).sort(sortD), ready = open.filter((x) => !urgent(x) && next(x).grp === 'ready').sort(sortD), wait = open.filter((x) => !urgent(x) && next(x).grp === 'wait').sort(sortD);
  let h = '<div class="wrap"><h1>Today · ' + fmt(TODAY) + '</h1><p class="muted" style="margin:4px 0 0">' + now.length + ' to do now · ' + ready.length + ' ready for you · ' + wait.length + ' waiting on others' + (S.inbox.length ? ' · <button class="link" data-nav="inbox">' + S.inbox.length + ' new email' + (S.inbox.length > 1 ? 's' : '') + ' in Inbox</button>' : '') + '</p>';
  if (!S.deals.length) h += '<div class="card" style="padding:20px;margin-top:20px"><h2>No deals yet</h2><p class="muted">Connect your Gmail in Settings, or add a deal with “+ New deal”.</p></div>';
  h += section('Do now', 'var(--red)', now, 'Nothing urgent.') + section('Ready for you', 'var(--ok)', ready, 'Nothing ready.') + section('Waiting on others', 'var(--blue)', wait, 'Nothing waiting.');
  const closed = S.deals.filter((x) => x.outcome); if (closed.length) h += '<details class="fold"><summary><span class="car">▸</span><span class="chip">' + closed.length + '</span>Won / lost</summary><div class="cards" style="margin-top:8px">' + closed.map(dcard).join('') + '</div></details>';
  return h + '</div>';
}

/* ---------- views: deal ---------- */
function stepBox(x, i, title, summary, body) {
  const cs = curStep(x); const st = i < cs ? 'done' : i === cs ? 'cur' : 'later'; const open = st === 'cur' ? S.open[x.id + 'c' + i] !== false : !!S.open[x.id + i];
  return '<section class="step ' + st + '"><button class="shead" data-step="' + i + '" aria-expanded="' + open + '"><span class="sn">' + (st === 'done' ? CHK : i + 1) + '</span><span style="flex:1 1 auto"><b>' + title + '</b>' + (summary ? '<br><span class="muted" style="font-size:13px">' + summary + '</span>' : '') + '</span><span class="muted" aria-hidden="true">' + (open ? '▾' : '▸') + '</span></button>' + (open ? '<div class="sbody">' + body + '</div>' : '') + '</section>';
}
function stepOpen(x, i) { const cs = curStep(x); return i === cs ? S.open[x.id + 'c' + i] !== false : !!S.open[x.id + i]; }
function viewDeal() {
  const x = byId(S.sel); if (!x) { S.view = 'today'; return viewToday(); }
  const c = cost(x), cs = curStep(x), g = x.generated, d = x.d || {};
  let h = '<div class="wrap"><button class="back" data-nav="today">← Today</button><div class="row" style="justify-content:space-between;align-items:flex-start;margin-top:4px"><div><h1>' + esc(x.customer) + '</h1><p class="muted" style="margin:2px 0 0">' + esc(x.project) + ' · ' + (x.sales ? esc(x.sales) : '<span class="t-amber">Sales owner?</span>') + ' · ' + esc(x.supplier || 'Supplier?') + '</p></div>' + dl(x) + '</div><div class="steps">';
  // 1 Costing
  let b1 = '';
  if (!d.priceReq) b1 += '<p style="margin:0 0 10px">Price not requested yet.</p><button class="btn primary" data-do="priceReq" data-id="' + x.id + '">Request price from ' + esc(x.supplier || 'supplier') + '</button>';
  b1 += '<ul class="slist">' + (x.costing || []).map((k, j) => '<li><span class="nm">' + esc(k.n) + ' <span class="muted">· ' + esc(k.t || '') + '</span></span>' +
    (k.status === 'waiting' ? '<span class="chip amber">Waiting</span><button class="btn sm ghost" data-rcv="' + j + '">Mark received</button>' : k.status === 'estimate' ? '<span class="chip amber">Estimate</span>' : '<span class="chip green">Received ' + fmt(k.d) + '</span>') + '</li>').join('') + '</ul>';
  b1 += '<form class="row" data-form="addCost" style="margin-top:8px"><input name="n" placeholder="+ Add cost source (e.g. SoW man-days)" aria-label="Add cost source" style="flex:1 1 220px;min-height:36px;padding:0 10px;border:1px solid #C3CDDA;border-radius:6px"><select name="t" aria-label="From" style="min-height:36px;border:1px solid #C3CDDA;border-radius:6px;background:#fff"><option>Supplier</option><option>Procurement</option><option>Technical</option></select><button class="btn sm">Add</button></form>';
  if (d.priceReq && !c.all) b1 += '<div class="row" style="margin-top:10px"><button class="btn ' + (next(x).tone === 'red' ? 'primary' : '') + '" data-do="follow" data-id="' + x.id + '">Follow up</button><span class="muted">Next follow-up ' + fmt(x.followUp) + '</span></div>';
  else if (cs === 0 && c.all) b1 += '<div class="row" style="margin-top:10px"><button class="btn ok" data-act="costsDone">Costs complete – build quote</button></div>';
  if ((x.files || []).length) b1 += '<h2 style="margin-top:14px">Files from email</h2><ul class="files">' + x.files.map((f) => '<li><a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a></li>').join('') + '</ul>';
  h += stepBox(x, 0, 'Costing', d.priceRcv ? 'Costs complete ' + fmt(d.priceRcv) : !d.priceReq ? 'Not requested' : c.got + ' of ' + c.total + ' received', b1);
  // 2 Quote
  let b2 = '';
  if (cs < 1 && !S.open[x.id + 'force']) b2 = '<p class="muted" style="margin:0">Opens when costing is complete. <button class="btn sm ghost" data-act="force">Build anyway</button></p>';
  else b2 = builder(x);
  h += stepBox(x, 1, 'Quote', d.drafted ? (g ? 'GP ' + money(g.gp) + ' · ' + Number(g.gpp).toFixed(1) + '% · Total ' + money(g.total) : 'Drafted ' + fmt(d.drafted)) : '', b2);
  // 3 Approval
  let b3 = cs < 2 ? '<p class="muted" style="margin:0">After the quote is drafted.</p>' :
    !d.approvalReq ? '<label class="field" style="max-width:280px;margin-bottom:10px">Approver<input data-edit="approver" list="approvers" value="' + esc(x.approver || '') + '"></label><button class="btn primary" data-do="approvalReq" data-id="' + x.id + '">Send for approval</button>' :
    !d.approved ? '<p style="margin:0 0 10px">Sent to ' + esc(x.approver) + ' on ' + fmt(d.approvalReq) + ' · ' + days(d.approvalReq, TODAY) + ' days ago</p><div class="row"><button class="btn primary" data-do="approved" data-id="' + x.id + '">Mark approved</button><button class="btn" data-mail="approval">Remind</button></div>' :
    '<p style="margin:0">Approved ' + fmt(d.approved) + '</p>';
  h += stepBox(x, 2, 'Approval', d.approved ? 'Approved ' + fmt(d.approved) : d.approvalReq ? 'Waiting since ' + fmt(d.approvalReq) : '', b3);
  // 4 Release
  let b4 = cs < 3 ? '<p class="muted" style="margin:0">After approval.</p>' : !d.released ? '<button class="btn primary" data-do="released" data-id="' + x.id + '">Release quote to ' + esc(x.sales || 'Sales') + '</button>' :
    '<p style="margin:0 0 10px">Released ' + fmt(d.released) + (x.custFollow ? ' · customer follow-up ' + fmt(x.custFollow) : '') + '</p>' + (x.outcome ? '<span class="chip ' + (x.outcome === 'won' ? 'green' : '') + '">' + (x.outcome === 'won' ? 'Won' : 'Lost') + '</span>' :
    '<div class="row"><button class="btn" data-do="custFollow" data-id="' + x.id + '">Log follow-up</button><button class="btn ok" data-out="won">Won (PO)</button><button class="btn" data-out="lost">Lost</button></div>');
  h += stepBox(x, 3, 'Release', d.released ? 'Released ' + fmt(d.released) : '', b4);
  h += '</div><details class="fold"><summary><span class="car">▸</span>Details &amp; activity</summary><div class="card" style="padding:16px;margin-top:8px"><div class="costs" style="margin-top:0">' +
    '<label class="field">Customer deadline<input type="date" data-edit="deadline" value="' + (x.deadline || '') + '"></label><label class="field">Next follow-up<input type="date" data-edit="followUp" value="' + (x.followUp || '') + '"></label>' +
    '<label class="field">Sales owner<input data-edit="sales" list="sales" value="' + esc(x.sales || '') + '"></label><label class="field">Supplier<input data-edit="supplier" value="' + esc(x.supplier || '') + '"></label></div>' +
    '<ul class="log">' + (x.log || []).map((l) => '<li><span class="muted">' + fmt(l.d) + '</span> – ' + esc(l.t) + (l.by ? ' <span class="muted">· ' + esc(l.by) + '</span>' : '') + '</li>').join('') + '</ul></div></details></div>';
  if ((x.lines || []).length && stepOpen(x, 1) && (cs >= 1 || S.open[x.id + 'force'])) h += stickyBar(x);
  return h;
}
function builder(x) {
  const p = x.pricing || (x.pricing = { cm: 7, ship: 0, mk: { Hardware: 30, Software: 10, Support: 30, Service: 30 }, flags: [] });
  const r = calc(x); let h = '';
  if (!(x.lines || []).length) {
    h += '<p style="margin:0 0 10px">No cost lines yet.</p><div class="row">' + ((x.files || []).length ? '<button class="btn primary" data-act="extract"' + (S.busy.extract ? ' disabled' : '') + '>' + (S.busy.extract ? '<span class="spin"></span> Claude is reading ' + x.files.length + ' file(s)…' : 'Read pricing with Claude') + '</button>' : '<span class="muted">No supplier files yet – they arrive from email.</span>') +
      '<button class="btn" data-act="addLine">Add line by hand</button></div>';
    return h;
  }
  if (p.ref) h += '<p class="muted" style="margin:0 0 8px;font-size:13px">' + esc(p.ref) + '</p>';
  if ((p.flags || []).length) h += '<div class="amberbox" style="margin-bottom:12px"><b>Check ' + p.flags.length + ' thing' + (p.flags.length > 1 ? 's' : '') + '</b><ul>' + p.flags.map((f) => '<li>' + esc(f) + '</li>').join('') + '</ul></div>';
  const cats = ['Hardware', 'Software', 'Support', 'Service'].filter((c) => r.cats[c]);
  h += '<div class="mk" aria-label="Markup by category">' + cats.map((c) => { const v = r.cats[c]; const k = c.replace(/\W/g, ''); if (p.mk[c] == null) p.mk[c] = c === 'Software' ? 10 : 30;
    return '<div class="mkbox"><label for="mk-' + k + '">' + c + '</label><input id="mk-' + k + '" class="num" data-mk="' + c + '" value="' + p.mk[c] + '"><span class="muted">%</span><span class="chip green" id="p-' + k + '">GP ' + (v.sell ? ((v.sell - v.cost) / v.sell * 100).toFixed(1) : '0') + '%</span></div>'; }).join('') + '</div>';
  h += '<div class="tbox"><table style="min-width:640px"><thead><tr><th></th><th>Item</th><th class="r">Qty</th><th class="r">Unit cost</th><th style="text-align:center">WHT 14%</th><th class="r">Selling</th><th></th></tr></thead><tbody>';
  x.lines.forEach((l, j) => { const hw = l.cat === 'Hardware';
    h += '<tr><td><input type="checkbox" data-line="' + j + '" data-f="inc" ' + (l.inc !== false ? 'checked' : '') + ' aria-label="Include line ' + (j + 1) + '" style="width:18px;height:18px"></td>' +
      '<td><input data-line="' + j + '" data-f="desc" value="' + esc(l.desc) + '" aria-label="Description line ' + (j + 1) + '" style="width:100%;min-width:220px;border:1px solid transparent;border-radius:6px;padding:4px 6px;background:transparent">' +
      '<div class="row" style="gap:6px;margin-top:2px"><input data-line="' + j + '" data-f="pn" value="' + esc(l.pn || '') + '" placeholder="P/N" aria-label="P/N line ' + (j + 1) + '" class="mono" style="width:150px;border:1px solid #E1E6EE;border-radius:6px;padding:2px 6px">' +
      '<select data-line="' + j + '" data-f="cat" aria-label="Category line ' + (j + 1) + '" style="border:1px solid #E1E6EE;border-radius:6px;background:#fff;font-size:12px">' + ['Hardware', 'Software', 'Support', 'Service'].map((o) => '<option' + (o === l.cat ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></div>' +
      (l.hint ? '<div class="' + (l.sugg ? 't-amber' : 'muted') + '" style="font-size:12px">WHT: ' + esc(l.hint) + '</div>' : '') + '</td>' +
      '<td class="r"><input class="num" style="width:56px" data-line="' + j + '" data-f="qty" value="' + l.qty + '" aria-label="Qty line ' + (j + 1) + '"></td>' +
      '<td class="r"><input class="num" style="width:100px" data-line="' + j + '" data-f="cost" value="' + l.cost + '" aria-label="Unit cost line ' + (j + 1) + '"></td>' +
      '<td style="text-align:center">' + (hw ? '<span class="muted" title="No WHT on hardware">–</span>' : '<label class="sw"><input type="checkbox" data-wht="' + j + '" ' + (l.wht ? 'checked' : '') + ' aria-label="WHT on line ' + (j + 1) + '"><span></span></label>') + '</td>' +
      '<td class="r" style="font-weight:600" id="st-' + j + '">' + (l.inc !== false ? money(l._st) : '–') + '</td><td><button class="ibtn" style="width:30px;height:30px;border:none" data-delline="' + j + '" aria-label="Remove line ' + (j + 1) + '">' + XI + '</button></td></tr>'; });
  h += '</tbody></table></div><div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="addLine">+ Add line</button>' + ((x.files || []).length ? '<button class="btn sm ghost" data-act="extract"' + (S.busy.extract ? ' disabled' : '') + '>' + (S.busy.extract ? '<span class="spin"></span> Reading…' : 'Read again with Claude') + '</button>' : '') + '</div>';
  h += '<div class="costs"><label class="field">Commission %<input data-deal="cm" value="' + (p.cm == null ? '' : p.cm) + '"></label><label class="field">Shipment (USD)' + (p.shipNote ? ' · estimate' : '') + '<input class="' + (p.shipNote ? 'est' : '') + '" data-deal="ship" value="' + (p.ship || 0) + '">' + (p.shipNote ? '<span class="t-amber" style="font-weight:400">' + esc(p.shipNote) + ' – confirm with Procurement</span>' : '') + '</label></div>';
  const ci = x.customerInfo || {}, t = x.terms || {};
  h += '<details class="fold" style="margin-top:12px"><summary><span class="car">▸</span>Quotation details' + (!ci.address || !ci.contact ? ' <span class="chip amber">needs info</span>' : '') + '</summary><div class="costs">' +
    [['customerInfo.name', 'Customer (legal name)', ci.name], ['customerInfo.address', 'Customer address', ci.address], ['customerInfo.contact', 'Contact person', ci.contact], ['customerInfo.phone', 'Contact phone', ci.phone],
     ['salesPhone', 'Sales mobile', x.salesPhone], ['quoteNo', 'Quotation no. (BGQ…)', x.quoteNo], ['terms.validity', 'Validity', t.validity], ['terms.payment', 'Payment terms', t.payment], ['terms.delivery', 'Delivery', t.delivery], ['terms.warranty', 'Warranty', t.warranty]]
      .map((f) => '<label class="field">' + f[1] + '<input data-qd="' + f[0] + '" value="' + esc(f[2] || '') + '"' + (/address|contact$/.test(f[0]) && !f[2] ? ' class="est"' : '') + '></label>').join('') + '</div></details>';
  const g = x.generated;
  if (g && g.at) h += '<div class="amberbox" style="margin-top:12px;background:var(--okbg);border-color:#A9D4B9;color:#173F26"><b>Drafts saved</b> ' + fmt(g.at.slice(0, 10)) + ' · <a href="' + esc(g.folderUrl) + '" target="_blank" rel="noopener">Folder</a> · <a href="' + esc(g.sprUrl) + '" target="_blank" rel="noopener">SPR .xlsx</a> · <a href="' + esc(g.quoteUrl) + '" target="_blank" rel="noopener">Quotation .docx</a></div>';
  return h;
}
function stickyBar(x) { const r = calc(x);
  return '<div class="sticky"><div class="in"><div class="kv"><small>Gross profit</small><b id="b-gp" style="color:var(--ok)">' + money(r.gp) + '</b></div><div class="kv"><small>GP %</small><b id="b-gpp">' + r.gpp.toFixed(1) + '%</b></div><div class="kv"><small>Total incl. VAT</small><b id="b-tot">' + money(r.total) + '</b></div><span style="flex:1 1 auto"></span><button class="btn primary" style="min-height:46px" data-act="generate"' + (S.busy.gen ? ' disabled' : '') + '>' + (S.busy.gen ? '<span class="spin"></span> Making drafts…' : (x.d.drafted ? 'Regenerate drafts' : 'Generate Quote')) + '</button></div></div>'; }
function patch() { const x = byId(S.sel); if (!x) return; const r = calc(x); const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  Object.keys(r.cats).forEach((c) => { const v = r.cats[c]; set('p-' + c.replace(/\W/g, ''), 'GP ' + (v.sell ? ((v.sell - v.cost) / v.sell * 100).toFixed(1) : '0') + '%'); });
  (x.lines || []).forEach((l, j) => set('st-' + j, l.inc !== false ? money(l._st) : '–')); set('b-gp', money(r.gp)); set('b-gpp', r.gpp.toFixed(1) + '%'); set('b-tot', money(r.total)); }

/* ---------- views: inbox ---------- */
const KIND = { supplier_pricing: 'Supplier price', customer_request: 'Customer request', sow: 'SoW', procurement_price: 'Procurement price', deal_registration: 'Deal registration', internal_followup: 'Internal', other: 'Other' };
function viewInbox() {
  let h = '<div class="wrap"><h1>Inbox</h1><p class="muted" style="margin:4px 0 16px">Emails Claude could not match for sure. Clear matches are attached to deals automatically.</p>';
  if (!S.inbox.length) return h + '<div class="card" style="padding:20px"><p style="margin:0">All clear – nothing to sort.</p></div></div>';
  const opts = S.deals.filter((d) => !d.outcome).map((d) => '<option value="' + d.id + '">' + esc(d.customer + ' · ' + d.project) + '</option>').join('');
  h += '<div class="card">' + S.inbox.map((m) => { const sug = m.dealId && byId(m.dealId);
    return '<div class="ibox"><div class="row" style="justify-content:space-between"><b>' + esc(m.subject) + '</b><span class="chip">' + (KIND[m.kind] || m.kind) + '</span></div><div class="muted" style="font-size:13px">' + esc(m.from) + ' · ' + fmt(m.date) + (m.link ? ' · <a href="' + esc(m.link) + '" target="_blank" rel="noopener">Open in Gmail</a>' : '') + '</div>' +
      '<p style="margin:6px 0">' + esc(m.summary) + '</p>' + ((m.files || []).length ? '<ul class="files">' + m.files.map((f) => '<li><a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a></li>').join('') + '</ul>' : '') +
      '<div class="row" style="margin-top:8px">' + (sug ? '<button class="btn sm ok" data-assign="' + m.id + '" data-deal="' + sug.id + '">Attach to ' + esc(sug.customer) + '</button>' : '') +
      '<select aria-label="Attach to deal" data-pick="' + m.id + '" style="min-height:34px;border:1px solid #C3CDDA;border-radius:8px;background:#fff;max-width:260px"><option value="">Attach to another deal…</option>' + opts + '</select>' +
      '<button class="btn sm" data-newfrom="' + m.id + '">New deal</button><button class="btn sm ghost" data-skip="' + m.id + '">Skip</button></div></div>'; }).join('') + '</div>';
  return h + '</div>';
}

/* ---------- views: settings ---------- */
function viewSettings() {
  const u = S.user || {}; const connected = !!u.lastScan;
  const apiUrl = CFG.API_URL || u.apiUrl || '';
  let h = '<div class="wrap"><h1>Settings</h1>';
  h += '<div class="card" style="padding:18px;margin-top:16px"><h2>Your account</h2><p style="margin:6px 0 0">' + esc(u.name) + ' · ' + esc(u.email) + ' · <span class="chip">' + esc(u.role) + '</span></p><div class="row" style="margin-top:12px"><button class="btn" data-act="signout">Sign out</button></div></div>';
  h += '<div class="card" style="padding:18px;margin-top:12px"><div class="row" style="justify-content:space-between"><h2>Connect your Gmail</h2>' + (connected ? '<span class="chip green">Connected · last checked ' + esc(new Date(u.lastScan).toLocaleString()) + '</span>' : '<span class="chip amber">Not connected</span>') + '</div>' +
    '<p class="muted" style="margin:6px 0 10px">A small script in your own Google account checks Gmail every 15 minutes and sends deal emails (quotes, BOQ, SoW, price files) to Quote Desk. It never sends or deletes email.</p>' +
    '<div class="field">Your connect key – keep it private</div><div class="keybox"><span id="ckey" style="flex:1 1 200px">' + esc(S.showKey ? u.connectKey : (u.connectKey || '').slice(0, 6) + '••••••••••••') + '</span><button class="btn sm" data-act="showKey">' + (S.showKey ? 'Hide' : 'Show') + '</button><button class="btn sm" data-copy="' + esc(u.connectKey) + '">Copy</button><button class="btn sm ghost" data-act="newKey">New key</button></div>' +
    (apiUrl ? '<div class="field" style="margin-top:10px">API URL</div><div class="keybox"><span style="flex:1 1 200px">' + esc(apiUrl) + '</span><button class="btn sm" data-copy="' + esc(apiUrl) + '">Copy</button></div>' : '') +
    (u.connectorAppUrl
      ? '<div class="row" style="margin-top:12px"><a class="btn primary" style="text-decoration:none;min-height:46px" target="_blank" rel="noopener" href="' + esc(u.connectorAppUrl + '?key=' + encodeURIComponent(u.connectKey || '')) + '">' + (connected ? 'Reconnect Gmail' : 'Connect Gmail') + '</a>' +
        (connected ? '<a class="btn ghost" style="text-decoration:none" target="_blank" rel="noopener" href="' + esc(u.connectorAppUrl + '?action=disconnect') + '">Disconnect</a>' : '') + '</div>' +
        '<p class="muted" style="margin:8px 0 0;font-size:13px">A Google page opens: choose your account and click <b>Allow</b>. Then come back here and press ↻.</p>' +
        '<details class="fold" style="margin-top:8px"><summary><span class="car">▸</span>Set up by hand instead</summary>'
      : '') +
    '<ol class="howto"><li>Open <a href="' + esc(u.connectorUrl || 'connector.txt') + '" target="_blank" rel="noopener">' + (u.connectorUrl ? 'the Connector script' : 'the Connector code') + '</a>' + (u.connectorUrl ? ' and click <b>Make a copy</b>.' : ', go to <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com</a> → New project, and paste it.') + '</li>' +
    '<li>Paste your <b>connect key</b> (and the <b>API URL</b> if empty) at the top of the script.</li><li>Choose <b>setup</b> and press <b>Run</b>. Allow access when Google asks.</li><li>Come back here – the status turns green after the first check.</li></ol>' +
    (u.connectorAppUrl ? '</details>' : '') + '</div>';
  h += '<div class="card" style="padding:18px;margin-top:12px"><h2>Install Quote Desk on this computer</h2><p class="muted" style="margin:6px 0 10px">It opens in its own window with a desktop icon.</p>' +
    (S.installEvt ? '<button class="btn primary" data-act="install">Install app</button>' : (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ? '<span class="chip green">Installed</span>' : '<p style="margin:0">In Chrome: click the install icon at the right of the address bar, or menu ⋮ → <b>Cast, save and share</b> → <b>Install page as app</b>.</p>') + '</div>';
  return h + '</div>';
}

/* ---------- auth ---------- */
let authMode = 'login', authEmail = '';
function renderAuth(err) {
  const f = (name, label, type, extra) => '<label class="field">' + label + '<input name="' + name + '" type="' + (type || 'text') + '" required ' + (extra || '') + '></label>';
  let h = '';
  if (authMode === 'login') h = '<h1 style="margin-top:16px">Sign in</h1><form data-auth="login">' + f('email', 'Email', 'email', 'autocomplete="email" value="' + esc(authEmail) + '"') + f('password', 'Password', 'password', 'autocomplete="current-password"') + '<div class="err" id="aerr">' + esc(err || '') + '</div><button class="btn primary">Sign in</button></form><div class="authlinks"><button class="link" data-amode="signup">Create account</button><button class="link" data-amode="forgot">Forgot password?</button></div>';
  if (authMode === 'signup') h = '<h1 style="margin-top:16px">Create account</h1><form data-auth="signup">' + f('name', 'Your name', 'text', 'autocomplete="name"') + f('email', 'Work email', 'email', 'autocomplete="email"') + f('password', 'Password (8+ characters)', 'password', 'minlength="8" autocomplete="new-password"') + '<div class="err" id="aerr">' + esc(err || '') + '</div><button class="btn primary">Send me a code</button></form><div class="authlinks"><button class="link" data-amode="login">I have an account</button></div>';
  if (authMode === 'verify') h = '<h1 style="margin-top:16px">Check your email</h1><p class="muted">We sent a 6-digit code to ' + esc(authEmail) + '.</p><form data-auth="verify">' + f('code', 'Code', 'text', 'inputmode="numeric" maxlength="6" autocomplete="one-time-code"') + '<div class="err" id="aerr">' + esc(err || '') + '</div><button class="btn primary">Confirm</button></form><div class="authlinks"><button class="link" data-amode="signup">Start again</button></div>';
  if (authMode === 'forgot') h = '<h1 style="margin-top:16px">Reset password</h1><form data-auth="forgot">' + f('email', 'Email', 'email', 'value="' + esc(authEmail) + '"') + '<div class="err" id="aerr">' + esc(err || '') + '</div><button class="btn primary">Send reset code</button></form><div class="authlinks"><button class="link" data-amode="login">Back to sign in</button></div>';
  if (authMode === 'reset') h = '<h1 style="margin-top:16px">New password</h1><p class="muted">Enter the code sent to ' + esc(authEmail) + '.</p><form data-auth="reset">' + f('code', 'Code', 'text', 'inputmode="numeric" maxlength="6"') + f('password', 'New password (8+ characters)', 'password', 'minlength="8" autocomplete="new-password"') + '<div class="err" id="aerr">' + esc(err || '') + '</div><button class="btn primary">Save and sign in</button></form>';
  if (authMode === 'pending') h = '<h1 style="margin-top:16px">Almost there</h1><p>Your email is confirmed. An admin needs to approve your account – you can sign in after that.</p><div class="authlinks"><button class="link" data-amode="login">Back to sign in</button></div>';
  if (!CFG.API_URL) h += '<p class="err" style="margin-top:18px">API URL is missing – set API_URL in config.js.</p>';
  $('#authBody').innerHTML = h;
  const first = $('#authBody input'); if (first) first.focus();
}
async function onAuth(form) {
  const v = Object.fromEntries(new FormData(form).entries()); const btn = form.querySelector('button'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
  try {
    if (form.dataset.auth === 'login') { authEmail = v.email; done(await api('auth.login', v)); }
    else if (form.dataset.auth === 'signup') { authEmail = v.email; await api('auth.signup', v); authMode = 'verify'; renderAuth(); }
    else if (form.dataset.auth === 'verify') { const r = await api('auth.verify', { email: authEmail, code: v.code }); if (r.pending) { authMode = 'pending'; renderAuth(); } else done(r); }
    else if (form.dataset.auth === 'forgot') { authEmail = v.email; await api('auth.requestReset', v); authMode = 'reset'; renderAuth(); }
    else if (form.dataset.auth === 'reset') done(await api('auth.reset', { email: authEmail, code: v.code, password: v.password }));
  } catch (e) { renderAuth(e.message); }
  function done(r) { S.token = r.token; S.user = r.user; store.set('qd_token', r.token); startApp(); }
}
function signOut(silent) { if (!S.demo && S.token && !silent) api('auth.logout').catch(() => {}); S.token = null; S.user = null; store.set('qd_token', null); $('#app').hidden = true; $('#auth').hidden = false; authMode = 'login'; renderAuth(); }

/* ---------- chat ---------- */
async function sendChat(text) {
  S.msgs.push({ role: 'user', content: text }); renderMsgs();
  S.msgs.push({ role: 'assistant', content: '…', pending: true }); renderMsgs();
  try { const r = await api('claude.chat', { dealId: S.view === 'deal' ? S.sel : null, messages: S.msgs.filter((m) => !m.pending).slice(-12) }); S.msgs.pop(); S.msgs.push({ role: 'assistant', content: r.reply }); }
  catch (e) { S.msgs.pop(); S.msgs.push({ role: 'assistant', content: 'Sorry – ' + e.message }); }
  renderMsgs();
}
function renderMsgs() { const b = $('#msgs'); b.innerHTML = S.msgs.map((m) => '<div class="m ' + (m.role === 'user' ? 'u' : 'c') + '">' + (m.pending ? '<span class="spin"></span>' : esc(m.content)) + '</div>').join(''); b.scrollTop = b.scrollHeight; }
function renderChips() { const x = S.view === 'deal' ? byId(S.sel) : null; const l = x ? ['What costing is missing?', 'Explain the GP', 'Draft a follow-up email'] : ['What should I do first today?', 'Which deals wait on suppliers?'];
  $('#chips').innerHTML = l.map((c) => '<button class="cchip" type="button" data-chip="' + esc(c) + '">' + esc(c) + '</button>').join(''); $('#ctx').textContent = x ? x.customer + ' · ' + x.project : S.view === 'inbox' ? 'Inbox' : 'All deals'; }
function layoutChat() { const c = $('#chat'); c.className = S.chat === 'pop' ? 'pop' : 'dock'; c.style.display = S.chat === 'min' ? 'none' : '';
  $('#handle').style.display = S.chat === 'dock' ? '' : 'none'; $('#bubble').style.display = S.chat === 'min' ? 'flex' : 'none'; $('#grip').style.display = S.chat === 'pop' ? '' : 'none';
  if (S.chat === 'dock') { c.style.width = S.dockW + 'px'; c.style.left = c.style.top = c.style.height = ''; }
  if (S.chat === 'pop') { c.style.left = S.pop.x + 'px'; c.style.top = S.pop.y + 'px'; c.style.width = S.pop.w + 'px'; c.style.height = S.pop.h + 'px'; } }

/* ---------- render ---------- */
function render() {
  document.querySelectorAll('[data-nav]').forEach((b) => { if (b.closest('.nav')) b.setAttribute('aria-current', (S.view === b.dataset.nav || (S.view === 'deal' && b.dataset.nav === 'today')) ? 'page' : 'false'); });
  const bd = $('#inboxBadge'); bd.hidden = !S.inbox.length; bd.textContent = S.inbox.length;
  $('#demoPill').hidden = !S.demo;
  const scroll = $('#main').scrollTop;
  $('#main').innerHTML = S.view === 'deal' ? viewDeal() : S.view === 'inbox' ? viewInbox() : S.view === 'settings' ? viewSettings() : viewToday();
  $('#main').scrollTop = scroll;
  renderChips(); layoutChat();
}
function modal(html) { $('#mbox').innerHTML = html; $('#modal').classList.add('open'); const i = $('#mbox input'); if (i) i.focus(); }
function closeModal() { $('#modal').classList.remove('open'); }
function toast(t, undo) { $('#ttext').textContent = t; $('#tundo').style.display = undo ? '' : 'none'; $('#toast').style.display = 'flex'; clearTimeout(toast.t); toast.t = setTimeout(() => { $('#toast').style.display = 'none'; }, 5000); }

function newDealForm(pre, fromInbox) {
  pre = pre || {};
  modal('<form data-form="newDeal" data-inbox="' + esc(fromInbox || '') + '"><div class="row" style="justify-content:space-between"><h2>New deal</h2><button type="button" class="ibtn" data-act="mclose" aria-label="Close">' + XI + '</button></div><div class="costs">' +
    '<label class="field">Customer<input name="customer" required value="' + esc(pre.customer || '') + '"></label><label class="field">Project<input name="project" required value="' + esc(pre.project || '') + '"></label>' +
    '<label class="field">Supplier<input name="supplier" value="' + esc(pre.supplier || '') + '"></label><label class="field">Sales owner<input name="sales" list="sales" value="' + esc(pre.sales || '') + '"></label>' +
    '<label class="field">Customer deadline<input name="deadline" type="date"></label><label class="field">Cost sources to wait for (comma)<input name="costing" placeholder="e.g. Supplier quote, Shipment"></label></div>' +
    '<div class="row" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn" data-act="mclose">Cancel</button><button class="btn primary">Create deal</button></div></form>');
}

/* ---------- data ---------- */
async function loadAll() {
  try {
    const [deals, inbox] = await Promise.all([api('deals.list'), api('inbox.list')]);
    S.deals = deals || []; S.inbox = inbox || []; render();
  } catch (e) { toast(e.message); }
}
async function startApp() {
  $('#auth').hidden = true; $('#app').hidden = false;
  if (!S.user) { try { S.user = await api('auth.me'); } catch (e) { return; } }
  if (!S.msgs.length) S.msgs.push({ role: 'assistant', content: 'Hi ' + (S.user.name || '').split(' ')[0] + '. Ask me about a deal, missing costing, GP or a follow-up email. I never set prices – you do.' });
  render(); renderMsgs(); await loadAll();
}

/* ---------- events ---------- */
document.addEventListener('submit', async (e) => {
  const f = e.target; e.preventDefault();
  if (f.dataset.auth) return onAuth(f);
  if (f.id === 'composer') { const v = $('#cin').value.trim(); if (!v) return; $('#cin').value = ''; return sendChat(v); }
  if (f.dataset.form === 'addCost') { const x = byId(S.sel); const v = Object.fromEntries(new FormData(f).entries()); if (!v.n.trim()) return; mutate(x, () => { x.costing = x.costing || []; x.costing.push({ n: v.n.trim(), t: v.t, status: 'waiting' }); if (x.d.priceRcv && !x.d.drafted) delete x.d.priceRcv; log(x, 'Added cost source: ' + v.n.trim()); }, 'Cost source added'); }
  if (f.dataset.form === 'newDeal') {
    const v = Object.fromEntries(new FormData(f).entries()); const btn = f.querySelector('.primary'); btn.disabled = true;
    const deal = { customer: v.customer, project: v.project, supplier: v.supplier, sales: v.sales, deadline: v.deadline || null, costing: v.costing ? v.costing.split(',').map((s) => s.trim()).filter(Boolean) : [] };
    try {
      if (f.dataset.inbox) { const r = await api('inbox.assign', { id: f.dataset.inbox, newDeal: deal }); closeModal(); await loadAll(); openDeal(r.dealId); }
      else { const d = await api('deals.create', { deal }); S.deals.push(d); closeModal(); openDeal(d.id); }
      toast('Deal created');
    } catch (err) { btn.disabled = false; toast(err.message); }
  }
});
document.addEventListener('click', async (e) => {
  const t = e.target; const q = (s) => t.closest(s); let b;
  if ((b = q('[data-amode]'))) { authMode = b.dataset.amode; renderAuth(); return; }
  if ((b = q('[data-chip]'))) { $('#cin').value = b.dataset.chip; $('#cin').focus(); return; }
  if ((b = q('[data-copy]'))) { try { await navigator.clipboard.writeText(b.dataset.copy); toast('Copied'); } catch (err) { toast('Copy blocked – select the text'); } return; }
  if ((b = q('[data-nav]'))) { S.view = b.dataset.nav; S.sel = null; render(); $('#main').scrollTop = 0; if (S.view === 'settings' && !S.demo) api('auth.me').then((u) => { S.user = u; render(); }).catch(() => {}); return; }
  if ((b = q('[data-do]'))) { e.stopPropagation(); act(b.dataset.do, byId(b.dataset.id)); return; }
  const x = S.sel ? byId(S.sel) : null;
  if ((b = q('[data-rcv]')) && x) { const k = x.costing[+b.dataset.rcv]; mutate(x, () => { k.status = 'received'; k.d = TODAY; log(x, 'Received: ' + k.n); if (cost(x).all && x.d.priceReq && !x.d.priceRcv) { x.d.priceRcv = TODAY; log(x, 'Costs complete'); } }, cost(x).waiting.length === 1 ? 'Costs complete – Quote step is open' : 'Marked received'); return; }
  if ((b = q('[data-mail]')) && x) { email(b.dataset.mail, x); return; }
  if ((b = q('[data-out]')) && x) { mutate(x, () => { x.outcome = b.dataset.out; log(x, x.outcome === 'won' ? 'Won – PO received' : 'Lost'); }, 'Marked ' + b.dataset.out); return; }
  if ((b = q('[data-delline]')) && x) { const j = +b.dataset.delline; mutate(x, () => { x.lines.splice(j, 1); }, 'Line removed'); return; }
  if ((b = q('[data-step]')) && x) { const i = +b.dataset.step; if (i === curStep(x)) S.open[x.id + 'c' + i] = S.open[x.id + 'c' + i] === false; else S.open[x.id + i] = !S.open[x.id + i]; render(); return; }
  if ((b = q('[data-assign]'))) { try { await api('inbox.assign', { id: b.dataset.assign, dealId: b.dataset.deal }); toast('Attached'); await loadAll(); } catch (err) { toast(err.message); } return; }
  if ((b = q('[data-newfrom]'))) { const m = S.inbox.find((i) => i.id === b.dataset.newfrom); newDealForm(m && m.newDeal, b.dataset.newfrom); return; }
  if ((b = q('[data-skip]'))) { try { await api('inbox.skip', { id: b.dataset.skip }); S.inbox = S.inbox.filter((i) => i.id !== b.dataset.skip); render(); toast('Skipped'); } catch (err) { toast(err.message); } return; }
  if (q('input,select,label,summary,a,textarea')) return;
  if ((b = q('[data-open]'))) { openDeal(b.dataset.open); return; }
  b = q('[data-act]'); if (!b) { if (t.id === 'modal') closeModal(); return; }
  const a = b.dataset.act;
  if (a === 'mclose') closeModal();
  else if (a === 'copy') { try { await navigator.clipboard.writeText($('#etext').textContent); toast('Copied'); } catch (err) { toast('Copy blocked – select the text'); } }
  else if (a === 'signout') signOut();
  else if (a === 'refresh') { await loadAll(); toast('Updated'); }
  else if (a === 'newDeal') newDealForm();
  else if (a === 'showKey') { S.showKey = !S.showKey; render(); }
  else if (a === 'newKey') { try { S.user = await api('auth.newConnectKey'); render(); toast('New key made – update it in your Connector script'); } catch (err) { toast(err.message); } }
  else if (a === 'install' && S.installEvt) { S.installEvt.prompt(); S.installEvt = null; render(); }
  else if (a === 'force' && x) { S.open[x.id + 'force'] = true; S.open[x.id + 1] = true; render(); }
  else if (a === 'costsDone' && x) mutate(x, () => { x.d.priceRcv = TODAY; log(x, 'Costs complete'); }, 'Costs complete – Quote step is open');
  else if (a === 'addLine' && x) { x.lines = x.lines || []; x.lines.push({ inc: true, cat: 'Hardware', desc: '', pn: '', qty: 1, cost: 0, wht: false }); if (cs1(x)) { S.open[x.id + 'force'] = true; S.open[x.id + 1] = true; } render(); saveSoon(x); }
  else if (a === 'extract' && x) { S.busy.extract = true; render(); try { const d = await api('claude.extract', { dealId: x.id }); Object.assign(x, d); toast('Claude found ' + (d.lines || []).length + ' cost lines – check them'); } catch (err) { toast(err.message); } S.busy.extract = false; render(); }
  else if (a === 'generate' && x) { clearTimeout(saveTimers[x.id]); delete saveTimers[x.id]; S.busy.gen = true; render(); try { await api('deals.save', { deal: x }).then((s) => Object.assign(x, s)); const d = await api('quote.generate', { dealId: x.id }); Object.assign(x, d); toast(S.demo ? 'Demo: drafts would be saved to Drive now' : 'Drafts saved to Drive – next: send for approval'); } catch (err) { toast(err.message); } S.busy.gen = false; render(); }
});
function cs1(x) { return curStep(x) < 1; }
document.addEventListener('change', (e) => {
  const t = e.target; const x = S.sel ? byId(S.sel) : null;
  if (t.dataset.pick) { if (t.value) api('inbox.assign', { id: t.dataset.pick, dealId: t.value }).then(() => { toast('Attached'); loadAll(); }).catch((err) => toast(err.message)); return; }
  if (!x) return;
  if (t.dataset.edit) { x[t.dataset.edit] = t.value || null; saveDeal(x, 'Saved'); return; }
  if (t.dataset.qd) { const path = t.dataset.qd.split('.'); if (path.length === 2) { x[path[0]] = x[path[0]] || {}; x[path[0]][path[1]] = t.value; } else x[path[0]] = t.value; saveSoon(x); return; }
  if (t.dataset.line != null) { const l = x.lines[+t.dataset.line]; const f = t.dataset.f;
    if (f === 'inc') l.inc = t.checked; else if (f === 'qty' || f === 'cost') { const v = parseFloat(String(t.value).replace(/,/g, '')); if (!isNaN(v)) l[f] = v; } else l[f] = t.value;
    if (f === 'cat' || f === 'inc') render(); else patch(); saveSoon(x); return; }
  if (t.dataset.wht != null) { x.lines[+t.dataset.wht].wht = t.checked; patch(); saveSoon(x); }
});
document.addEventListener('input', (e) => {
  const t = e.target; const x = S.sel ? byId(S.sel) : null; if (!x || !x.pricing) return;
  if (t.dataset.mk) { const v = parseFloat(t.value); x.pricing.mk[t.dataset.mk] = isNaN(v) ? 0 : v; patch(); saveSoon(x); }
  if (t.dataset.deal) { const v = parseFloat(String(t.value).replace(/,/g, '')); x.pricing[t.dataset.deal] = isNaN(v) ? 0 : v; patch(); saveSoon(x); }
  if (t.dataset.line != null && (t.dataset.f === 'qty' || t.dataset.f === 'cost')) { const v = parseFloat(String(t.value).replace(/,/g, '')); if (!isNaN(v)) { x.lines[+t.dataset.line][t.dataset.f] = v; patch(); } }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('#modal').classList.contains('open')) closeModal(); });
$('#tundo').addEventListener('click', () => { if (S.undo) { const u = S.undo; S.undo = null; u(); } $('#toast').style.display = 'none'; });
$('#minBtn').addEventListener('click', () => { S.chat = 'min'; layoutChat(); });
$('#bubble').addEventListener('click', () => { S.chat = window.innerWidth < 860 ? 'pop' : 'dock'; layoutChat(); renderMsgs(); });
$('#toggleMode').addEventListener('click', () => { if (S.chat === 'dock') { const w = $('#shell').offsetWidth; S.pop = { x: Math.max(8, w - S.pop.w - 24), y: 70, w: S.pop.w, h: S.pop.h }; S.chat = 'pop'; } else S.chat = window.innerWidth < 860 ? 'min' : 'dock'; layoutChat(); });
$('#handle').addEventListener('pointerdown', (e) => { e.preventDefault(); const sh = $('#shell'); const mv = (ev) => { const r = sh.getBoundingClientRect(); S.dockW = Math.max(300, Math.min(720, Math.round(r.right - ev.clientX))); $('#chat').style.width = S.dockW + 'px'; }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
$('#grip').addEventListener('pointerdown', (e) => { e.preventDefault(); const c = $('#chat'); S.pop.w = c.offsetWidth; S.pop.h = c.offsetHeight; const sx = e.clientX, sy = e.clientY, ox = S.pop.x, oy = S.pop.y; const sh = $('#shell'); const mv = (ev) => { S.pop.x = Math.max(0, Math.min(sh.offsetWidth - 80, ox + ev.clientX - sx)); S.pop.y = Math.max(0, Math.min(sh.offsetHeight - 60, oy + ev.clientY - sy)); c.style.left = S.pop.x + 'px'; c.style.top = S.pop.y + 'px'; }; const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; if (S.view === 'settings') render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user) loadAll(); });
setInterval(() => { if (!document.hidden && S.user && !Object.keys(saveTimers).length) loadAll(); }, 5 * 60 * 1000);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

// datalists for names
document.body.insertAdjacentHTML('beforeend', '<datalist id="sales">' + (CFG.SALES || []).map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist><datalist id="approvers">' + (CFG.APPROVERS || []).map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist>');

// boot
store.set('qd_demo', null);
if (S.token && S.token !== 'demo' && CFG.API_URL) startApp();
else { $('#auth').hidden = false; renderAuth(); }
})();
