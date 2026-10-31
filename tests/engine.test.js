const test = require('node:test');
const assert = require('node:assert');
const E = require('../app/src/main/assets/engine.js');

const base = { rate: 5.5, indem: 7, hpd: 9, hsup: 2, start: '2026-09-07' };
const S = (extra) => Object.assign({}, base, { cp: new Set(), abs: new Set() }, extra);
const octCp = ['2026-09-30', '2026-10-01', '2026-10-02'];
for (let d = 23; d <= 29; d++) octCp.push('2026-10-' + d);

test('jours fériés 2026 / 2027', () => {
  const h26 = E.holidays(2026), h27 = E.holidays(2027);
  assert.ok(h26['2026-04-06'] && h26['2026-05-14'] && h26['2026-05-25']);
  assert.ok(h27['2027-03-29'] && h27['2027-05-06'] && h27['2027-05-17']);
});

test('septembre 2026 : 18 j, 164 h, 902 + 119 = 1021', () => {
  const r = E.computeMonth(S({ year: 2026, month: 9, cp: new Set(['2026-09-30']) }));
  assert.equal(r.mensu, 18); assert.equal(r.heures, 164);
  assert.equal(r.salaire, 902); assert.equal(r.entretien, 119); assert.equal(r.total, 1021);
});

test('octobre 2026 : 22 ouvrés, 15 travaillés, 7 CP ouvrés, 9 CPO, cumul 10', () => {
  const r = E.computeMonth(S({ year: 2026, month: 10, cp: new Set(octCp) }));
  assert.equal(r.ouvres, 22); assert.equal(r.trav, 15); assert.equal(r.cpOuvres, 7);
  assert.equal(r.cpo, 9); assert.equal(r.cumCpo, 10); assert.equal(r.heures, 200);
  assert.equal(r.salaire, 1100); assert.equal(r.entretien, 105); assert.equal(r.total, 1205);
});

test('novembre 2026 : 20 ouvrés, 182 h, 1001 + 140 = 1141', () => {
  const r = E.computeMonth(S({ year: 2026, month: 11 }));
  assert.equal(r.ouvres, 20); assert.equal(r.heures, 182);
  assert.equal(r.salaire, 1001); assert.equal(r.entretien, 140); assert.equal(r.total, 1141);
});

test('droits au 29/10/2026 : prorata 5, 4 semaines 3, pris 10', () => {
  const s = S({ cp: new Set(octCp) });
  const asOf = E.parseISO('2026-10-29');
  const a = E.leaveRights(s, asOf, { mode: 'prorata' }), b = E.leaveRights(s, asOf, { mode: '4sem' });
  assert.equal(a.acquisBase, 5); assert.equal(b.acquisBase, 3);
  assert.equal(a.pris, 10); assert.equal(a.solde, -5); assert.equal(b.solde, -7);
  assert.equal(a.status, 'depassement'); assert.equal(a.refStart, '2026-06-01');
});

test('correction manuelle, enfants à charge et plafond', () => {
  const s = S({ start: '2020-01-01' });
  const r = E.leaveRights(s, E.parseISO('2027-05-31'), { enfants: 2, correction: 1 });
  assert.equal(r.acquisBase, 30); assert.equal(r.extra, 4); assert.equal(r.acquis, 35);
});

test('regroupement des périodes', () => {
  const g = E.groupPeriods(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-20']);
  assert.equal(g.length, 2); assert.equal(g[0].n, 4);
});

test('paymentStatus', () => {
  assert.equal(E.paymentStatus(1021, 971.5).status, 'a_verser');
  assert.equal(E.paymentStatus(1021, 971.5).ecart, 49.5);
  assert.equal(E.paymentStatus(100, 100).status, 'regle');
  assert.equal(E.paymentStatus(100, 120).status, 'trop_percu');
});

test('validation profil / enfant / contrat', () => {
  const today = '2026-10-31';
  assert.deepEqual(Object.keys(E.validateProfile({ nom: '', prenom: 'A' }, today)), ['nom']);
  assert.ok(E.validateProfile({ nom: 'A', prenom: 'B', email: 'x' }, today).email);
  assert.ok(E.validateProfile({ nom: 'A', prenom: 'B', telephone: '123' }, today).telephone);
  assert.ok(!E.validateProfile({ nom: 'A', prenom: 'B', telephone: '06 12 34 56 78', codePostal: '92160' }, today).telephone);
  assert.ok(E.validateChild({ nom: 'A', prenom: 'B', naissance: '2030-01-01' }, today).naissance);
  assert.ok(E.validateChild({ nom: 'A', prenom: 'B' }, today).naissance);
  assert.deepEqual(E.validateContract({ start: '2026-09-07', taux: 5.5, indemnite: 7, hpd: 9, hsup: 2, enfantsCharge: 0 }), {});
  assert.ok(E.validateContract({ start: '', taux: 0, indemnite: 7, hpd: 9, hsup: 2, enfantsCharge: 0 }).taux);
});

test('export / import', () => {
  const ex = E.buildExport({ days: [{ k: 1 }], months: [], payments: [] }, '2026-10-31T10:00:00Z');
  const p = E.parseExport(JSON.stringify(ex));
  assert.ok(p.ok); assert.equal(p.counts.days, 1);
  assert.ok(!E.parseExport('pas du json').ok);
  assert.ok(!E.parseExport(JSON.stringify({ app: 'autre', schemaVersion: 2, data: {} })).ok);
  assert.ok(!E.parseExport(JSON.stringify({ app: 'paie-assmat', schemaVersion: 99, data: {} })).ok);
});
