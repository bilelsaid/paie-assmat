/* Coquille iOS (Capacitor) : SQLite natif pour les données métier (D2), Preferences pour les petites valeurs,
   Filesystem + Share pour l'export, feuille de partage pour le texte. Chargé uniquement dans le build iOS (scripts/build-www.js).
   Mêmes signatures que db.js ; Engine.STORES liste les magasins. */
(function (root) {
  'use strict';
  var DBN = 'paie-assmat', SINGLE = { profile: 1, settings: 1 };
  var INS = 'INSERT OR REPLACE INTO kv(store, key, json) VALUES (?, ?, ?)';

  function create(cap, win) {
    var active = !!(cap && cap.isNativePlatform && cap.isNativePlatform() && cap.getPlatform && cap.getPlatform() === 'ios');
    var out = { active: active };
    if (!active) return out;
    var Pl = cap.Plugins, SQL = Pl.CapacitorSQLite, Pref = Pl.Preferences, FS = Pl.Filesystem, Share = Pl.Share;
    var cache = {};

    // Chargé avant le démarrage de l'appli : lecture synchrone ensuite (Platform.prefs.get).
    out.ready = Pref.get({ key: 'paie.lastBackupAt' }).then(function (r) { cache.lastBackupAt = r && r.value != null ? r.value : null; }, function () { /* ignore */ });
    out.prefs = {
      get: function (k) { return cache[k] === undefined ? null : cache[k]; },
      set: function (k, v) { cache[k] = v; Pref.set({ key: 'paie.' + k, value: String(v) }).catch(function () { /* ignore */ }); }
    };

    function keyOf(store, rec) { return String(store === 'days' || store === 'months' || store === 'leave_years' ? rec.key : rec.id); }
    function q(sql, vals) { return SQL.query({ database: DBN, statement: sql, values: vals || [] }).then(function (r) { return (r && r.values) || []; }); }
    function batch(set) { return set.length ? SQL.executeSet({ database: DBN, set: set, transaction: true }) : Promise.resolve(); }
    function putOp(store, rec, key) { return { statement: INS, values: [store, key === undefined ? keyOf(store, rec) : String(key), JSON.stringify(rec)] }; }
    function clearOp(store) { return { statement: 'DELETE FROM kv WHERE store = ?', values: [store] }; }

    var DB = {};
    DB.open = function () {
      return Promise.resolve(SQL.createConnection({ database: DBN, version: 1, encrypted: false, mode: 'no-encryption', readonly: false })).catch(function () { /* connexion déjà créée */ })
        .then(function () { return SQL.open({ database: DBN, readonly: false }); })
        .then(function () { return SQL.execute({ database: DBN, statements: 'CREATE TABLE IF NOT EXISTS kv(store TEXT NOT NULL, key TEXT NOT NULL, json TEXT NOT NULL, PRIMARY KEY(store, key));' }); })
        .then(function () { /* prêt */ });
    };
    DB.get = function (s, k) { return q('SELECT json FROM kv WHERE store = ? AND key = ?', [s, String(k)]).then(function (r) { return r.length ? JSON.parse(r[0].json) : undefined; }); };
    DB.all = function (s) { return q('SELECT json FROM kv WHERE store = ? ORDER BY key', [s]).then(function (r) { return r.map(function (x) { return JSON.parse(x.json); }); }); };
    DB.put = function (s, v, k) { return batch([putOp(s, v, k)]); };
    DB.del = function (s, k) { return batch([{ statement: 'DELETE FROM kv WHERE store = ? AND key = ?', values: [s, String(k)] }]); };

    // Remplace l'API de transaction IndexedDB utilisée par app.js : les opérations sont regroupées puis exécutées en une transaction SQL.
    DB.tx = function (stores, mode, fn) {
      var set = [];
      var t = { objectStore: function (s) {
        return {
          put: function (v, k) { set.push(putOp(s, v, k)); },
          delete: function (k) { set.push({ statement: 'DELETE FROM kv WHERE store = ? AND key = ?', values: [s, String(k)] }); },
          clear: function () { set.push(clearOp(s)); }
        };
      } };
      try { fn(t); } catch (e) { return Promise.reject(e); }
      return batch(set);
    };

    DB.replaceDays = function (records) {
      var set = [clearOp('days')]; records.forEach(function (r) { set.push(putOp('days', r)); }); return batch(set);
    };
    DB.dump = async function () {
      var o = {}, i, s, a;
      for (i = 0; i < root.Engine.STORES.length; i++) {
        s = root.Engine.STORES[i]; a = await DB.all(s);
        if (s === 'months') a = a.filter(function (m) { return m.contractId; });
        o[s] = SINGLE[s] ? (a[0] || null) : a;
      }
      return o;
    };
    DB.restore = async function (data, mode) {
      var existing = {}, set = [];
      if (mode === 'merge') { existing.profile = await DB.get('profile', 'main'); existing.settings = await DB.get('settings', 'main'); }
      root.Engine.STORES.forEach(function (s) {
        var v = data[s];
        if (mode === 'replace') set.push(clearOp(s));
        if (SINGLE[s]) { if (v && (mode === 'replace' || !existing[s])) set.push(putOp(s, v)); }
        else (v || []).forEach(function (r) { set.push(putOp(s, r)); });
      });
      if (mode === 'replace') set.push(clearOp('state'));
      return batch(set);
    };
    DB.clearAll = function () { return batch(root.Engine.STORES.concat(['state']).map(clearOp)); };
    out.DB = DB;

    out.files = {
      exportJSON: function (name, json) {
        FS.writeFile({ path: name, data: json, directory: 'CACHE', encoding: 'utf8' })
          .then(function (r) { return Share.share({ title: name, url: r.uri, dialogTitle: 'Enregistrer la sauvegarde' }); })
          .then(function () { win.onExportResult(true); }, function () { win.onExportResult(false); });
      }
    };
    out.share = {
      available: function () { return true; },
      text: function (t) { Share.share({ text: t }).catch(function () { /* annulé */ }); }
    };
    return out;
  }

  var api = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { var s = create(root.Capacitor, root); root.IosShell = s; if (s.active) root.DB = s.DB; }
})(typeof window !== 'undefined' ? window : global);
