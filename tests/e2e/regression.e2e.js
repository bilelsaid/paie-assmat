// T13 (FR-1) : parcours F0-F4 complet + migration v1 + export/import. Lancer : node tests/e2e/regression.e2e.js (Playwright requis)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', '..', 'app', 'src', 'main', 'assets');
const srv = http.createServer((q, r) => {
  let p = q.url.split('?')[0]; if (p === '/') p = '/index.html';
  try { const b = fs.readFileSync(path.join(root, p)); r.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(b); }
  catch (e) { r.writeHead(404); r.end(); }
});
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  await new Promise(r => srv.listen(8765, r));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 412, height: 900 }, acceptDownloads: true });
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await pg.clock.install({ time: new Date('2026-10-31T10:00:00') });
  const U = 'http://localhost:8765/index.html';

  // --- seed base v1 (migration) ---
  await pg.goto(U); await pg.waitForSelector('#onb:not([hidden])'); await pg.evaluate(() => new Promise((res) => { DB.db.close(); indexedDB.deleteDatabase('paie-assmat').onsuccess = res; }));
  await pg.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open('paie-assmat', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('state'); d.createObjectStore('months', { keyPath: 'key' }); };
    r.onsuccess = () => { const d = r.result, t = d.transaction(['state', 'months'], 'readwrite');
      t.objectStore('state').put({ year: 2026, month: 10, rate: 5.5, indem: 7, hpd: 9, hsup: 2, start: '2026-09-07', unp: {}, cp: ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'], abs: [] }, 'main');
      t.objectStore('months').put({ key: '2026-09', year: 2026, month: 9, rate: 5.5, indem: 7, hpd: 9, hsup: 2, unpaid: 0, cp: ['2026-09-30'], abs: [], mensu: 18, heures: 164, salaire: 902, accueil: 17, entretien: 119, total: 1021, cpOuvres: 1, cpo: 1 });
      t.oncomplete = () => { d.close(); res(); }; t.onerror = () => rej(t.error); };
  }));
  await pg.reload();
  await pg.waitForSelector('#onb:not([hidden])');
  ok(await pg.inputValue('#p-nom') === '', 'onboarding affiché');
  // validation
  await pg.click('#o-next'); ok((await pg.textContent('#e-p-nom')).includes('obligatoire'), 'erreur nom parent');
  await pg.fill('#p-nom', 'Said'); await pg.fill('#p-prenom', 'Bilel'); await pg.fill('#p-email', 'x'); await pg.click('#o-next');
  ok((await pg.textContent('#e-p-email')).includes('invalide'), 'erreur email');
  await pg.fill('#p-email', 'said.bilel@outlook.com'); await pg.fill('#p-cp', '92160'); await pg.fill('#p-tel', '06 12 34 56 78'); await pg.selectOption('#p-lien', 'pere'); await pg.click('#o-next');
  await pg.click('#o-next'); ok((await pg.textContent('#e-c-naissance')).length > 0, 'erreur naissance enfant');
  await pg.fill('#c-nom', 'Said'); await pg.fill('#c-prenom', 'Lina'); await pg.fill('#c-naissance', '2025-03-01'); await pg.click('#o-next');
  ok(await pg.inputValue('#k-start') === '2026-09-07' && await pg.inputValue('#k-taux') === '5.5', 'contrat prérempli depuis v1');
  await pg.click('#o-next');
  await pg.waitForSelector('#cal');
  ok(await pg.isHidden('#onb'), 'onboarding terminé');
  ok(errs.length === 0, 'aucune erreur console: ' + errs.join('|'));

  // Mois: octobre 2026
  await pg.selectOption('#month', '10');
  const pay = await pg.textContent('#pay');
  ok(pay.includes('200,0') && /1\s?205,00/.test(pay), 'octobre = 1 205,00 € migré depuis v1');
  ok((await pg.textContent('#hist')).includes('septembre') , 'mois v1 migré dans l\'historique');

  // À saisir
  await pg.click('[data-tab=saisir]');
  let txt = await pg.textContent('#screen'); ok(txt.includes('200') && /1\s?100,00/.test(txt) && txt.includes('105,00'), 'À saisir octobre');
  await pg.click('[data-copy=heures]'); await pg.check('[data-chk=heures]');
  await pg.click('#decl'); await pg.waitForFunction(()=>document.getElementById('st').textContent.includes('Déclaré')); ok((await pg.textContent('#st')).includes('Déclaré'), 'marqué déclaré');
  await pg.click('#pm'); txt = await pg.textContent('#screen'); ok(txt.includes('902,00') && txt.includes('164'), 'À saisir septembre = 164 h / 902,00');

  // Congés
  await pg.click('[data-tab=conges]'); txt = await pg.textContent('#screen');
  ok(txt.includes('Dépassement'), 'alerte dépassement'); ok(/Pris\s*10 j/.test(txt), 'pris 10');
  await pg.fill('#lv-corr', '2'); await pg.click('#lv-save'); txt = await pg.textContent('#screen'); ok(txt.includes('Correction manuelle'), 'correction manuelle');

  // Paiements: septembre 971,50 le 01/10
  await pg.click('[data-tab=paiements]'); txt = await pg.textContent('#screen'); ok(txt.includes('À verser'), 'septembre à verser');
  await pg.selectOption('#pa-m', '' ).catch(()=>{}); 
  await pg.selectOption('#pa-m', 'c1|2026-09'); await pg.fill('#pa-d', '2026-10-01'); await pg.fill('#pa-a', '971,50'); await pg.click('#pa-add'); await pg.waitForFunction(()=>document.getElementById('screen').textContent.includes('49,50'));
  txt = await pg.textContent('#screen'); ok(txt.includes('49,50') && txt.includes('À verser'), 'écart 49,50 €');
  await pg.click('[data-comp="c1|2026-09"]'); ok(await pg.inputValue('#pa-a') === '49.5', 'complément prérempli');
  await pg.click('#pa-add'); await pg.waitForFunction(()=>document.getElementById('screen').textContent.includes('Réglé')); txt = await pg.textContent('#screen'); ok(txt.includes('Réglé'), 'mois réglé après régularisation');

  // Réglages: export / import
  await pg.click('[data-tab=reglages]');
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#bk-exp')]);
  const file = require('os').tmpdir() + '/paie-export.json'; await dl.saveAs(file);
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(j.schemaVersion === 2 && j.data.payments.length === 2 && j.data.days.length === 8 && j.data.profile.nom === 'Said', 'export JSON complet');
  ok(!(await pg.textContent('#bk-info')).includes('Aucune'), 'date de dernière sauvegarde');
  // supprimer tout
  await pg.click('#del-ask'); await pg.click('#del-yes'); await pg.waitForSelector('#onb:not([hidden])');
  ok(true, 'suppression → onboarding');
  // import via fichier : onboarding bloque l'UI; ré-ouvrir app avec data importée via API
  await pg.evaluate(async (t) => { const p = Engine.parseExport(t); await DB.restore(p.data, 'replace'); }, fs.readFileSync(file, 'utf8'));
  await pg.reload(); await pg.waitForSelector('#cal');
  await pg.click('[data-tab=paiements]'); txt = await pg.textContent('#screen'); ok(txt.includes('Réglé'), 'restauration OK après rechargement');
  // import UI: fichier invalide
  await pg.click('[data-tab=reglages]');
  await pg.setInputFiles('#bk-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') });
  await pg.waitForFunction(() => document.getElementById('bk-msg').textContent.length > 0);
  ok((await pg.textContent('#bk-msg')).includes('pas un JSON'), 'import invalide refusé');
  await pg.setInputFiles('#bk-file', file); await pg.waitForSelector('#im-merge'); await pg.click('#im-merge');
  await pg.waitForFunction(() => document.getElementById('bk-msg').textContent.includes('Import terminé'));
  ok(true, 'import fusion');
  // bandeau 30 jours
  await pg.evaluate(async () => { await DB.put('settings', { id: 'main', migrated: true, lastBackupAt: '2026-08-01T00:00:00Z', createdAt: '2026-08-01' }); });
  await pg.reload(); await pg.waitForSelector('#cal'); ok(await pg.isVisible('#banner'), 'rappel sauvegarde 30 j');
  await pg.screenshot({ path: require('os').tmpdir() + '/mois.png' });
  await pg.click('[data-tab=conges]'); await pg.screenshot({ path: require('os').tmpdir() + '/conges.png' });
  await pg.click('[data-tab=saisir]'); await pg.screenshot({ path: require('os').tmpdir() + '/saisir.png' });
  const overflow = await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  ok(!overflow, 'pas de débordement horizontal');
  ok(errs.length === 0, 'aucune erreur console finale: ' + errs.join('|'));
  await b.close(); srv.close();
})();
