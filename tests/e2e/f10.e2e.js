// F10 : récapitulatif PDF + image, 3 cibles (TP4, TP5, TP6). Web (téléchargement), faux Android (exportBinary), faux Capacitor iOS.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const fake = require('../helpers/fake-capacitor.js');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const assets = path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'backup-android-1.1.0.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const serve = (dir, port) => new Promise(r => { const s = http.createServer((q, res) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(fs.readFileSync(path.join(dir, p))); } catch (e) { res.writeHead(404); res.end(); } }).listen(port, () => r(s)); });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'f10-'));
const pdfText = (buf) => { const f = path.join(tmp, 'x' + Math.random() + '.pdf'); fs.writeFileSync(f, buf);
  return { qpdf: cp.spawnSync('qpdf', ['--check', f]).status, text: cp.execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' }).replace(/[  ]/g, ' ').replace(/[ \t]+/g, ' ') }; };
const pngSize = (b) => ({ sig: b.slice(0, 8).toString('hex'), w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
const seed = async (pg) => { await pg.goto(pg.__u); await pg.waitForSelector('#onb:not([hidden])');
  await pg.evaluate(async (d) => { await DB.open(); await DB.restore(Object.assign({}, d, { profile: Object.assign({}, d.profile, { nannyName: 'Mme Dupont' }) }), 'replace'); }, ref);
  await pg.reload(); await pg.waitForSelector('#cal'); };
const spyCanvas = () => { window.__texts = []; const o = CanvasRenderingContext2D.prototype.fillText; CanvasRenderingContext2D.prototype.fillText = function (t) { window.__texts.push(t); return o.apply(this, arguments); }; };
const cspSpy = () => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); };
const gotoYear2026 = async (pg) => { await pg.click('[data-tab=annee]'); while (!(await pg.textContent('h1')).includes('2026')) { const y = Number((await pg.textContent('h1')).slice(-4)); await pg.click(y < 2026 ? '#y-next' : '#y-prev'); } };

(async () => {
  const b = await chromium.launch(), errs = [];
  // ---------- A. web
  const sA = await serve(assets, 8795);
  { const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, serviceWorkers: 'block' }), pg = await ctx.newPage(); pg.__u = 'http://localhost:8795/';
    pg.on('pageerror', e => errs.push(e.message)); await pg.addInitScript(spyCanvas); await pg.addInitScript(cspSpy);
    await seed(pg);
    await pg.selectOption('#month', '9'); await pg.dispatchEvent('#month', 'change');
    const dl = async (sel) => { const [d] = await Promise.all([pg.waitForEvent('download'), pg.click(sel)]); const f = path.join(tmp, d.suggestedFilename()); await d.saveAs(f); return { name: d.suggestedFilename(), buf: fs.readFileSync(f) }; };
    let r = await dl('#pdf-month'); let t = pdfText(r.buf);
    ok(r.name === 'paie-assmat-2026-09.pdf', 'TP4 web FR-F10-6 : nom ' + r.name);
    ok(t.qpdf === 0, 'TP4 web : PDF valide (qpdf --check)');
    ok(['902,00 €', '119,00 €', '1 021,00 €', 'Mme Dupont', 'Septembre 2026', 'Montants indicatifs'].every(s => t.text.includes(s)), 'TP4 web FR-F10-1/2/8 : contenu du PDF de septembre');
    ok(!/Camille|Dupont,|Exempleville|example\.org|06 12/.test(t.text.replace('Mme Dupont', '')), 'TP1 web FR-F10-3 : aucune identité (adresse, e-mail, téléphone, prénom)');
    r = await dl('#png-month'); const s = pngSize(r.buf);
    ok(r.name === 'paie-assmat-2026-09.png' && s.sig === '89504e470d0a1a0a' && s.w === 1240 && s.h === 1754, 'TP5 web FR-F10-7 : PNG mensuel ' + s.w + '×' + s.h);
    const drawn = await pg.evaluate(() => window.__texts.join('|'));
    ok(/1 021,00 €/.test(drawn.replace(/[  ]/g, ' ')) && drawn.includes('Mme Dupont'), 'TP5/TP6 web : texte dessiné sur le canvas (montants + nom)');
    const dark = await pg.evaluate(async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n; }, r.buf.toString('base64'));
    ok(dark > 5000, 'TP5 web : l’image contient du texte (pixels sombres ' + dark + ')');
    await gotoYear2026(pg);
    r = await dl('#y-pdf'); t = pdfText(r.buf);
    ok(r.name === 'paie-assmat-2026.pdf' && t.qpdf === 0, 'TP3 web FR-F10-4/6 : ' + r.name + ', valide');
    ok(['2 226,00 €', '1 021,00 €', '1 205,00 €', 'Mme Dupont', '2 mois non enregistrés'].every(s => t.text.includes(s)) && ['Janvier', 'Décembre'].every(s => t.text.includes(s)), 'TP3 web : 12 mois + totaux');
    await pg.evaluate(() => { window.__texts = []; });
    r = await dl('#y-png'); const s2 = pngSize(r.buf);
    ok(r.name === 'paie-assmat-2026.png' && s2.w === 1240 && s2.h === 1754 && s2.sig === '89504e470d0a1a0a', 'TP5 web FR-F10-7 : PNG annuel ' + s2.w + '×' + s2.h);
    const d2 = (await pg.evaluate(() => window.__texts.join('|'))).replace(/[  ]/g, ' ');
    ok(d2.includes('2 226,00 €') && d2.includes('1 021,00 €'), 'TP5 web : totaux annuels dessinés (2 226,00 € dû, 1 021,00 € versé)');
    // l'export d'un récapitulatif ne doit pas marquer une « sauvegarde » (FR-12)
    ok(await pg.evaluate(() => !localStorage.getItem('paie.lastBackupAt')), 'FR-12 : le récapitulatif ne compte pas comme sauvegarde');
    // FR-F10-8 : champ dans Réglages, vide → pas de ligne
    await pg.click('[data-tab=reglages]'); await pg.fill('#p-nanny', ''); await pg.click('#sv-p');
    await pg.waitForSelector('#bk-msg:not(:empty)'); await pg.click('[data-tab=mois]'); await pg.selectOption('#month', '9'); await pg.dispatchEvent('#month', 'change');
    t = pdfText((await dl('#pdf-month')).buf);
    ok(!/Assistante maternelle/.test(t.text) && !t.text.includes('undefined'), 'TP6 web FR-F10-8 : champ vide → aucune ligne');
    ok((await pg.evaluate(() => window.__csp)).length === 0, 'web : 0 violation de CSP (téléchargements inclus)');
    await ctx.close(); }
  sA.close();

  // ---------- B. faux Android (pont exportBinary)
  const sB = await serve(assets, 8796);
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }), pg = await ctx.newPage(); pg.__u = 'http://localhost:8796/';
    pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { window.__bin = []; window.Android = { exportBinary(n, m, b) { window.__bin.push({ n, m, b }); setTimeout(() => window.onBinaryExportResult(window.__accept !== false), 10); }, exportFile() { window.__json = true; }, importFile() {}, share() {} }; });
    await seed(pg); ok(await pg.evaluate(() => Platform.target) === 'android', 'TP4 Android : cible détectée');
    await pg.selectOption('#month', '9'); await pg.dispatchEvent('#month', 'change');
    await pg.click('#pdf-month'); await pg.waitForFunction(() => /PDF prêt/.test(document.getElementById('recap-msg').textContent));
    let call = await pg.evaluate(() => window.__bin[0]);
    ok(call.n === 'paie-assmat-2026-09.pdf' && call.m === 'application/pdf' && Buffer.from(call.b, 'base64').slice(0, 5).toString() === '%PDF-', 'TP4 Android FR-F10-5 : exportBinary(pdf) appelé, contenu PDF');
    ok(pdfText(Buffer.from(call.b, 'base64')).qpdf === 0, 'TP4 Android : PDF transmis valide');
    await pg.click('#png-month'); await pg.waitForFunction(() => window.__bin.length === 2); call = await pg.evaluate(() => window.__bin[1]);
    ok(call.n === 'paie-assmat-2026-09.png' && call.m === 'image/png' && Buffer.from(call.b, 'base64').slice(1, 4).toString() === 'PNG', 'TP4/TP5 Android : exportBinary(png)');
    ok(await pg.evaluate(() => window.__json !== true), 'TP4 Android : exportFile (JSON) non utilisé');
    await pg.evaluate(() => { window.__accept = false; }); await pg.click('#pdf-month');
    await pg.waitForFunction(() => /annulé/.test(document.getElementById('recap-msg').textContent));
    ok(true, 'TP4 Android : annulation signalée'); await ctx.close(); }
  sB.close();

  // ---------- C. iOS (faux Capacitor)
  const www = fs.mkdtempSync(path.join(os.tmpdir(), 'www-')); cp.execFileSync('node', [path.join(__dirname, '..', '..', 'scripts', 'build-www.js'), www]);
  const sC = await serve(www, 8797);
  { const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), pg = await ctx.newPage(); pg.__u = 'http://localhost:8797/';
    pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(`(${function (mk) { var ls = window.localStorage; window.Capacitor = mk({ get: function (k) { var v = ls.getItem('fake.' + k); return v === null ? undefined : v; }, set: function (k, v) { ls.setItem('fake.' + k, v); } }, 'ios'); }.toString()})(${fake.toString()})`);
    await seed(pg); ok(await pg.evaluate(() => Platform.target) === 'ios', 'TP4 iOS : cible détectée');
    await pg.selectOption('#month', '9'); await pg.dispatchEvent('#month', 'change');
    await pg.click('#pdf-month'); await pg.waitForFunction(() => /PDF prêt/.test(document.getElementById('recap-msg').textContent));
    ok(await pg.evaluate(() => Capacitor.__log.some(l => l === 'writeFile:CACHE:paie-assmat-2026-09.pdf') && Capacitor.__log.some(l => l.startsWith('share:') && l.includes('paie-assmat-2026-09.pdf'))), 'TP4 iOS FR-F10-5 : fichier écrit en cache puis feuille de partage');
    const b64 = await pg.evaluate(() => Capacitor.__files['paie-assmat-2026-09.pdf']);
    ok(Buffer.from(b64, 'base64').slice(0, 5).toString() === '%PDF-' && pdfText(Buffer.from(b64, 'base64')).qpdf === 0, 'TP4 iOS : contenu base64 = PDF valide');
    await pg.click('#png-month'); await pg.waitForFunction(() => /Image prête/.test(document.getElementById('recap-msg').textContent));
    const pb = Buffer.from(await pg.evaluate(() => Capacitor.__files['paie-assmat-2026-09.png']), 'base64'); const sz = pngSize(pb);
    ok(sz.w === 1240 && sz.h === 1754, 'TP5 iOS : PNG ' + sz.w + '×' + sz.h);
    await pg.evaluate(() => localStorage.setItem('fake.share.cancel', '1')); await pg.click('#pdf-month');
    await pg.waitForFunction(() => /annulé/.test(document.getElementById('recap-msg').textContent));
    ok(true, 'TP4 iOS : annulation du partage signalée'); await ctx.close(); }
  sC.close();

  ok(errs.length === 0, 'aucune erreur JS ' + errs.join('|'));
  await b.close(); process.exit(fails ? 1 : 0);
})();
