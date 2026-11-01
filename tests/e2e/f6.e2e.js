// F6 : onglet Année (TY4 : FR-F6-1, 2, 3, 4, 5, 6, 7). Sauvegarde de référence importée dans IndexedDB.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const assets = path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'backup-android-1.1.0.json'), 'utf8')).data;
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const srv = http.createServer((q, res) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' }); res.end(fs.readFileSync(path.join(assets, p))); } catch (e) { res.writeHead(404); res.end(); } });
(async () => {
  await new Promise(r => srv.listen(8791, r));
  const b = await chromium.launch(), errs = [];
  for (const vp of [{ width: 390, height: 800 }, { width: 1280, height: 900 }]) {
    const ctx = await b.newContext({ viewport: vp, serviceWorkers: 'block' }), pg = await ctx.newPage();
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('http://localhost:8791/'); await pg.waitForSelector('#onb:not([hidden])');
    await pg.evaluate(async (d) => { for (const s of ['profile', 'settings']) await DB.put(s, d[s]);
      for (const s of ['children', 'contracts', 'months', 'payments']) for (const r of d[s]) await DB.put(s, r); }, ref);
    await pg.reload(); await pg.waitForSelector('#cal');
    const tag = vp.width + 'px ';
    ok(await pg.locator('#tabs button').count() === 6, tag + 'FR-F6-1 : 6 onglets');
    await pg.click('[data-tab=annee]');
    ok((await pg.textContent('h1')) === 'Année ' + new Date().getFullYear(), tag + 'FR-F6-1 : année civile en cours affichée');
    // navigation vers 2026 (année du jeu de données)
    while (!(await pg.textContent('h1')).includes('2026')) { const y = Number((await pg.textContent('h1')).slice(-4)); await pg.click(y < 2026 ? '#y-next' : '#y-prev'); }
    const rows = await pg.locator('#y-rows .pj').count();
    ok(rows === 12, tag + 'FR-F6-2 : 12 lignes (' + rows + ')');
    const txt = (await pg.textContent('#y-rows')).replace(/[  ]/g, ' ');
    ok(/Septembre — 18 j · 164,0 h · salaire 902,00 € · entretien 119,00 €/.test(txt) && /1 021,00 € versé 1 021,00 € · écart 0,00 €/.test(txt.replace(/\s+/g, ' ').replace('1 021,00 €versé', '1 021,00 € versé')), tag + 'FR-F6-2 : septembre');
    const tot = (await pg.textContent('#y-tot')).replace(/[  ]/g, ' ');
    ok(/40 j/.test(tot) && /364,0 h/.test(tot) && /2 002,00 €/.test(tot) && /224,00 €/.test(tot) && /2 226,00 €/.test(tot), tag + 'FR-F6-3 : totaux 40 j / 364 h / 2 002 / 224 / 2 226');
    ok(/1 021,00 €/.test(tot) && /1 205,00 €/.test(tot) && /verser/.test(tot), tag + 'FR-F6-4 : versé 1 021 et écart 1 205 à verser');
    ok((await pg.textContent('#y-unrec')).startsWith('2 mois non enregistrés'), tag + 'FR-F6-3 : 2 mois non enregistrés');
    ok((await pg.textContent('#y-rows')).includes('avant le contrat'), tag + 'FR-F6-3 : mois avant le contrat signalés');
    ok((await pg.textContent('#y-cp')).includes('10 jours ouvrables pris'), tag + 'FR-F6-5 : 10 jours ouvrables pris');
    const ovf = await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    ok(!ovf, tag + 'NFR : pas de défilement horizontal');
    await pg.click('#y-conges'); ok((await pg.textContent('h1')) === 'Droits à congés', tag + 'FR-F6-5 : lien vers Congés');
    await pg.click('[data-tab=annee]');
    while (!(await pg.textContent('h1')).includes('2026')) await pg.click('#y-prev');
    await pg.click('.yrow[data-ym="2026-09"]');
    ok(await pg.inputValue('#month') === '9' && await pg.inputValue('#year') === '2026', tag + 'FR-F6-6 : clic sur septembre ouvre le mois 2026-09');
    await pg.click('[data-tab=annee]');
    while (!(await pg.textContent('h1')).includes('2025')) { const y = Number((await pg.textContent('h1')).slice(-4)); await pg.click(y < 2025 ? '#y-next' : '#y-prev'); }
    ok((await pg.textContent('#y-empty')).replace(/ /g, ' ') === "Aucun mois enregistré en 2025. Enregistre un mois depuis l'écran Mois.", tag + 'FR-F6-7 : état vide');
    await ctx.close();
  }
  ok(errs.length === 0, 'aucune erreur JS ' + errs.join('|'));
  await b.close(); srv.close(); process.exit(fails ? 1 : 0);
})();
