// F6 : Engine.yearSummary (TY1-TY3). Spec : docs/specs/03-F6-F10-F12.md, FR-F6-2 à FR-F6-5.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const E = require('../app/src/main/assets/engine.js');
const ref = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'backup-android-1.1.0.json'), 'utf8')).data;
const START = '2026-09-07';

test('TY1 FR-F6-2/3 : totaux 2026 de la sauvegarde de référence', () => {
  const y = E.yearSummary(ref.months, ref.payments, 2026, START);
  assert.equal(y.rows.length, 12);
  const sep = y.rows[8];
  assert.equal(sep.status, 'enregistre');
  assert.deepEqual([sep.mensu, sep.heures, sep.salaire, sep.entretien, sep.total, sep.paid, sep.ecart], [18, 164, 902, 119, 1021, 1021, 0]);
  assert.deepEqual(y.totals, { mensu: 40, heures: 364, salaire: 2002, entretien: 224, total: 2226 });
  assert.equal(y.recorded, 2);
  assert.equal(y.unrecorded, 2); // novembre et décembre
  assert.equal(y.rows[10].status, 'non_enregistre'); assert.equal(y.rows[11].status, 'non_enregistre');
});

test('TY2 FR-F6-4 : versé 1021, écart annuel 1205 ; CPO pris 10 (FR-F6-5)', () => {
  const y = E.yearSummary(ref.months, ref.payments, 2026, START);
  assert.equal(y.paid, 1021);
  assert.equal(y.ecart, 1205);
  assert.equal(y.cpo, 10);
});

test('TY3 FR-F6-3/7 : avant contrat exclus, année vide, dates de paiement hors année ignorées', () => {
  const y = E.yearSummary(ref.months, ref.payments, 2026, START);
  assert.equal(y.rows[0].status, 'avant_contrat'); // janvier 2026
  assert.equal(y.rows[7].status, 'avant_contrat'); // août 2026 (contrat au 07/09)
  assert.equal(y.rows[8].status, 'enregistre');
  assert.equal(y.beforeContract, 8);
  const v = E.yearSummary(ref.months, ref.payments, 2025, START);
  assert.equal(v.recorded, 0); assert.equal(v.totals.total, 0); assert.equal(v.paid, 0); assert.equal(v.ecart, 0);
  assert.equal(v.rows.every(r => r.status === 'avant_contrat'), true);
  const w = E.yearSummary(ref.months, ref.payments, 2027, START);
  assert.equal(w.recorded, 0); assert.equal(w.unrecorded, 12); assert.equal(w.paid, 0);
  // un paiement daté 2027 sur un mois 2026 n'entre pas dans le versé 2026
  const late = ref.payments.concat([{ id: 'x', monthKey: 'c1|2026-09', date: '2027-01-05', amount: 10, kind: 'versement' }]);
  assert.equal(E.yearSummary(ref.months, late, 2026, START).paid, 1021);
  // sans contrat connu : aucun mois « avant contrat »
  assert.equal(E.yearSummary([], [], 2026, '').beforeContract, 0);
  // arrondi : pas de dérive flottante
  const m = [{ key: 'c1|2026-09', year: 2026, month: 9, mensu: 1, heures: 1, salaire: 0.1, entretien: 0.2, total: 0.3, cpo: 0 }];
  assert.equal(E.yearSummary(m, [{ monthKey: 'c1|2026-09', date: '2026-09-30', amount: 0.1 }, { monthKey: 'c1|2026-09', date: '2026-09-30', amount: 0.2 }], 2026, START).ecart, 0);
});
