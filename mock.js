// Demo backend: same actions as the Apps Script API, kept in memory with sample data.
(function () {
  const T = () => new Date().toISOString().slice(0, 10);
  const add = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const mk = { Hardware: 30, Software: 30, Support: 30, Service: 30 };
  const base = (o) => Object.assign({ followUp: null, custFollow: null, approver: 'Delly Kong', files: [], emails: [], lines: [],
    pricing: { ref: '', cm: 7, ship: 0, shipNote: '', mk: Object.assign({}, mk), flags: [] },
    customerInfo: { name: o.customer, address: '', contact: '', phone: '' }, terms: { validity: '', payment: '', delivery: '', warranty: '' },
    quoteNo: '', log: [], version: 1 }, o);
  const deals = [
    base({ id: 'ipu', customer: 'IPU Bank', project: 'Sangfor DC & RAM Expansion', sales: 'Ratana Seng', supplier: 'Sangfor', deadline: add(1), followUp: add(-1),
      d: { request: add(-40), priceReq: add(-26) },
      costing: [{ n: 'Sangfor price list', t: 'Supplier', status: 'received', d: add(-37) }, { n: 'Sangfor final discount', t: 'Supplier', status: 'waiting' }] }),
    base({ id: 'dfi', customer: 'DFI Lucky', project: 'Meraki & Aruba – new stores', sales: 'Sivannarith Nov', supplier: 'Synnex FPT, ICT', deadline: add(3), followUp: add(2),
      d: { request: add(-28), priceReq: add(-27) },
      costing: [{ n: 'Synnex FPT – Meraki MX + licence', t: 'Supplier', status: 'received', d: add(-23) }, { n: 'ICT – Aruba switches & APs', t: 'Supplier', status: 'received', d: add(-22) },
        { n: 'ICT – AP licence ×20', t: 'Supplier', status: 'waiting' }, { n: 'Shipment', t: 'Procurement', status: 'estimate' }],
      files: [{ id: 'f1', name: 'Synnex quote 12 Oct.pdf', url: '#', kind: 'supplier_pricing' }, { id: 'f2', name: 'ICT CAM26-0305.xlsx', url: '#', kind: 'supplier_pricing' }],
      pricing: { ref: 'Synnex FPT 12 Oct + ICT CAM26-0305 13 Oct', cm: 0, ship: 1450, shipNote: 'Estimate from past Synnex + ICT shipments', mk: Object.assign({}, mk),
        flags: ['MX68CW is under the same Cisco end-of-life notice as MX67C – confirm successor.', 'AP-515 cost $680 vs $420 in Mar-26 (+62%).'] },
      lines: [
        { inc: true, cat: 'Hardware', desc: 'Cisco Meraki MX68CW incl. CON-ROB', pn: 'MX68CW', qty: 10, cost: 1648, wht: false },
        { inc: true, cat: 'Software', desc: 'Meraki MX68CW Advanced Security licence, 3 years', pn: 'LIC-MX68CW-SEC-3YR', qty: 10, cost: 1083, wht: true, sugg: true, hint: 'Suggested – overseas software, no VAT invoice' },
        { inc: true, cat: 'Hardware', desc: 'HPE Aruba Instant On 1930 24G PoE', pn: 'JL683B', qty: 9, cost: 750, wht: false },
        { inc: true, cat: 'Support', desc: 'Instant On 1930 – 3 years support', pn: 'HR1Z6E', qty: 9, cost: 160, wht: false, hint: 'Bundled with hardware – no WHT' },
        { inc: true, cat: 'Hardware', desc: 'Aruba AP-515', pn: 'Q9H62A', qty: 20, cost: 680, wht: false },
        { inc: true, cat: 'Support', desc: 'AP-515 – 3 years support', pn: 'HC4K0E', qty: 20, cost: 220, wht: false, hint: 'Bundled with hardware – no WHT' },
        { inc: true, cat: 'Hardware', desc: 'AP mount bracket', pn: 'S4K79A', qty: 20, cost: 35, wht: false }] }),
    base({ id: 'itgdn', customer: 'ITGDN', project: 'Huawei OceanStor 5210', sales: 'Sophat Hang', supplier: 'Huawei', deadline: add(6),
      d: { request: add(-42), priceReq: add(-42), priceRcv: add(-29) },
      costing: [{ n: 'Huawei storage quote (01 Oct)', t: 'Supplier', status: 'received', d: add(-29) }, { n: 'Shipment', t: 'Procurement', status: 'estimate' }],
      files: [{ id: 'f3', name: 'Biplan_ITDGN 01Oct26.xlsx', url: '#', kind: 'supplier_pricing' }],
      pricing: { ref: 'Huawei quote 0000Hl00876383202610010002 · 01 Oct 2026', cm: 5, ship: 2500, shipNote: 'Estimate from a past Huawei storage deal', mk: Object.assign({}, mk), flags: [] },
      lines: [] }),
    base({ id: 'smart', customer: 'Smart Axiata', project: 'xFusion Server_T2', sales: '', supplier: 'Konegram', deadline: add(8),
      d: { request: add(-1) }, costing: [{ n: 'Konegram xFusion quote', t: 'Supplier', status: 'waiting' }] }),
    base({ id: 'east', customer: 'East Group', project: 'Storage & Virtualization', sales: 'Sienghai Ly', supplier: 'Dell, xFusion, Fortinet', deadline: add(6), approver: 'Chanthen Lun',
      d: { request: add(-21), priceReq: add(-21), priceRcv: add(-15), drafted: add(-13), approvalReq: add(-13) },
      costing: [{ n: 'Dell ME5212 storage', t: 'Supplier', status: 'received', d: add(-15) }, { n: 'xFusion / HPE server', t: 'Supplier', status: 'received', d: add(-15) }],
      generated: { gp: 18733, gpp: 14.7, total: 140278.6, sales: 127526 } }),
    base({ id: 'ktela', customer: 'Kampuchea Tela', project: 'xFusion + Huawei DCS', sales: 'Sienghai Ly', supplier: 'Konegram, Huawei', deadline: null, custFollow: add(3),
      d: { request: add(-45), priceReq: add(-34), priceRcv: add(-28), drafted: add(-28), approvalReq: add(-28), approved: add(-27), released: add(-26) },
      costing: [{ n: 'Konegram – xFusion 2288 V8', t: 'Supplier', status: 'received', d: add(-30) }, { n: 'Huawei UniSTAR quote', t: 'Supplier', status: 'received', d: add(-28) }],
      generated: { gp: 68992.85, gpp: 17.7, total: 428828.4, sales: 389844 } })
  ];
  deals.forEach((x) => { const L = { request: 'Customer request', priceReq: 'Price requested', priceRcv: 'Costs complete', drafted: 'Quote drafted', approvalReq: 'Sent for approval', approved: 'Approved', released: 'Released to Sales' };
    Object.keys(L).forEach((k) => { if (x.d[k]) x.log.unshift({ d: x.d[k], t: L[k], by: 'Demo' }); }); });
  const ITGDN_LINES = [
    { inc: true, cat: 'Hardware', desc: 'Huawei OceanStor 5210 – controller, 2× SmartIO, 12× 10TB NL-SAS, 8× 3.84TB SSD, 4U DAE, licence', pn: '02356VWK', qty: 1, cost: 64655.92, wht: false },
    { inc: true, cat: 'Support', desc: 'Co-Care Standard 36M + Hi-Care', pn: '', qty: 1, cost: 3418.65, wht: false, hint: 'Bundled with hardware – no WHT' },
    { inc: true, cat: 'Service', desc: 'Huawei Flash Storage planning, design & implementation', pn: '', qty: 1, cost: 34120.8, wht: false, hint: 'Bundled with hardware – no WHT' }];
  const inbox = [
    { id: 'm1', from: 'ICT Distribution <sales@ict.example>', subject: 'RE: DFI Lucky – AP licence co-term Dec-2026', date: T(), kind: 'supplier_pricing', dealId: 'dfi', confidence: 0.72,
      summary: 'ICT sends the price for 20× Aruba AP licences co-termed to Dec-2026.', files: [{ id: 'f9', name: 'ICT licence quote.pdf', url: '#' }] },
    { id: 'm2', from: 'Konegram <sales@konegram.example>', subject: 'Quotation – xFusion 2288 V8 for Smart Axiata', date: T(), kind: 'supplier_pricing', dealId: 'smart', confidence: 0.66,
      summary: 'Konegram quotes xFusion servers for Smart Axiata (T2).', files: [{ id: 'f10', name: 'Konegram_SmartAxiata_T2.pdf', url: '#' }] },
    { id: 'm3', from: 'Sample Customer IT <it@customer.example>', subject: 'Request for quotation – Firewall renewal', date: T(), kind: 'customer_request', dealId: '', confidence: 0,
      summary: 'Customer asks for a FortiGate renewal quote.', files: [], newDeal: { customer: 'Sample Customer', project: 'FortiGate Renewal', supplier: 'Fortinet' } }
  ];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const find = (id) => { const d = deals.find((x) => x.id === id); if (!d) throw new Error('Deal not found'); return d; };
  const user = { email: 'demo@quotedesk.app', name: 'Lina (demo)', role: 'admin', connectKey: 'qd_demo_key_not_real', lastScan: '', connectorUrl: '', apiUrl: '' };
  function attach(item, dealId) {
    const d = find(dealId);
    d.files = (d.files || []).concat(item.files || []);
    const w = (d.costing || []).filter((c) => c.status === 'waiting');
    if (item.kind !== 'customer_request' && w.length) { w[0].status = 'received'; w[0].d = T(); d.log.unshift({ d: T(), t: 'Attached from Inbox: ' + w[0].n, by: user.name }); }
    if (d.d.priceReq && !d.d.priceRcv && d.costing.every((c) => c.status !== 'waiting')) { d.d.priceRcv = T(); d.log.unshift({ d: T(), t: 'Costs complete', by: user.name }); }
    d.version++;
  }
  const H = {
    'auth.login': () => ({ token: 'demo', user }), 'auth.signup': () => ({ sent: true }), 'auth.verify': () => ({ token: 'demo', user }),
    'auth.requestReset': () => ({ sent: true }), 'auth.reset': () => ({ token: 'demo', user }),
    'auth.me': () => user, 'auth.logout': () => ({ ok: true }), 'auth.newConnectKey': () => { user.connectKey = 'qd_demo_' + Math.random().toString(36).slice(2, 10); return user; },
    'deals.list': () => clone(deals),
    'deals.create': (r) => { const s = r.deal; const d = base({ id: 'd' + Date.now(), customer: s.customer, project: s.project, sales: s.sales || '', supplier: s.supplier || '', deadline: s.deadline || null,
      d: { request: T() }, costing: (s.costing || []).map((n) => ({ n, t: 'Supplier', status: 'waiting' })) }); d.log.unshift({ d: T(), t: 'Deal created', by: user.name }); deals.push(d); return clone(d); },
    'deals.save': (r) => { const i = deals.findIndex((x) => x.id === r.deal.id); const d = clone(r.deal); d.version = (deals[i] ? deals[i].version : 0) + 1; if (i >= 0) deals[i] = d; else deals.push(d); return clone(d); },
    'inbox.list': () => clone(inbox),
    'inbox.assign': (r) => { const i = inbox.findIndex((x) => x.id === r.id); const it = inbox[i]; let id = r.dealId;
      if (!id) id = H['deals.create']({ deal: r.newDeal || it.newDeal }).id; attach(it, id); inbox.splice(i, 1); return { dealId: id }; },
    'inbox.skip': (r) => { const i = inbox.findIndex((x) => x.id === r.id); inbox.splice(i, 1); return { ok: true }; },
    'claude.extract': (r) => { const d = find(r.dealId); d.lines = clone(d.id === 'itgdn' ? ITGDN_LINES : [{ inc: true, cat: 'Hardware', desc: 'Sample item from supplier file', pn: 'SAMPLE-01', qty: 1, cost: 1000, wht: false }]);
      d.pricing.flags = d.id === 'itgdn' ? ['Currency, Incoterm and validity are not in the Huawei file.', 'Huawei needs end-user details for deal registration.'] : ['Demo lines – replace with real supplier data.'];
      d.log.unshift({ d: T(), t: 'Claude read ' + (d.files.length || 1) + ' file(s): ' + d.lines.length + ' cost lines', by: 'Claude' }); d.version++; return clone(d); },
    'quote.generate': (r) => { const d = find(r.dealId); const c = window.QDCalc(d); d.generated = { at: new Date().toISOString(), sales: c.sales, gp: c.gp, gpp: c.gpp, total: c.total, folderUrl: '#', sprUrl: '#', quoteUrl: '#' };
      d.d.priceRcv = d.d.priceRcv || T(); d.d.drafted = d.d.drafted || T(); d.log.unshift({ d: T(), t: 'Drafts generated – GP ' + c.gpp.toFixed(1) + '% (demo, no files made)', by: user.name }); d.version++; return clone(d); },
    'claude.chat': (r) => ({ reply: 'Demo mode – connect the API to get real answers from Claude.\n\nIn the real app I can list missing costing, explain the GP and draft follow-up emails for this deal. I never set prices.' })
  };
  window.QDMock = {
    call(action, data) {
      return new Promise((res, rej) => setTimeout(() => {
        try { if (!H[action]) throw new Error('Not in demo: ' + action); res(H[action](data || {})); } catch (e) { rej(e); }
      }, action.startsWith('claude') || action === 'quote.generate' ? 900 : 150));
    }
  };
})();
