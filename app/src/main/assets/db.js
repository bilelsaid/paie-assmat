/* Base locale IndexedDB (v2). Les magasins v1 « state » et « months » sont conservés ;
   « months » est réutilisé (clé « c1|AAAA-MM » pour les nouveaux enregistrements). */
(function (root) {
  'use strict';
  var NAME = 'paie-assmat', VERSION = 2;
  var DB = { db: null };
  var SINGLE = { profile: 1, settings: 1 };

  DB.open = function () {
    return new Promise(function (res, rej) {
      if (!root.indexedDB) return rej(new Error('no idb'));
      var r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = function (e) {
        var d = r.result, old = e.oldVersion;
        if (old < 1) { d.createObjectStore('state'); d.createObjectStore('months', { keyPath: 'key' }); }
        if (old < 2) {
          ['profile', 'children', 'contracts', 'rates', 'payments', 'settings'].forEach(function (n) { d.createObjectStore(n, { keyPath: 'id' }); });
          ['days', 'leave_years'].forEach(function (n) { d.createObjectStore(n, { keyPath: 'key' }); });
        }
      };
      r.onsuccess = function () { DB.db = r.result; res(); };
      r.onerror = function () { rej(r.error); };
    });
  };
  DB.tx = function (stores, mode, fn) {
    return new Promise(function (res, rej) {
      if (!DB.db) return rej(new Error('db closed'));
      var t = DB.db.transaction(stores, mode), q = fn(t);
      t.oncomplete = function () { res(q && q.result); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error); };
    });
  };
  DB.get = function (s, k) { return DB.tx(s, 'readonly', function (t) { return t.objectStore(s).get(k); }); };
  DB.all = function (s) { return DB.tx(s, 'readonly', function (t) { return t.objectStore(s).getAll(); }); };
  DB.put = function (s, v, k) { return DB.tx(s, 'readwrite', function (t) { return k === undefined ? t.objectStore(s).put(v) : t.objectStore(s).put(v, k); }); };
  DB.del = function (s, k) { return DB.tx(s, 'readwrite', function (t) { return t.objectStore(s).delete(k); }); };

  DB.replaceDays = function (records) {
    return DB.tx('days', 'readwrite', function (t) {
      var o = t.objectStore('days'); o.clear();
      records.forEach(function (r) { o.put(r); });
    });
  };

  DB.dump = async function () {
    var out = {}, i, s, a;
    for (i = 0; i < Engine.STORES.length; i++) {
      s = Engine.STORES[i]; a = await DB.all(s);
      if (s === 'months') a = a.filter(function (m) { return m.contractId; });
      out[s] = SINGLE[s] ? (a[0] || null) : a;
    }
    return out;
  };

  // mode : 'replace' (remplace tout) ou 'merge' (fusionne, l'import l'emporte sur la même clé)
  DB.restore = async function (data, mode) {
    var existing = {};
    if (mode === 'merge') { existing.profile = await DB.get('profile', 'main'); existing.settings = await DB.get('settings', 'main'); }
    return DB.tx(Engine.STORES.concat(['state']), 'readwrite', function (t) {
      Engine.STORES.forEach(function (s) {
        var o = t.objectStore(s), v = data[s];
        if (mode === 'replace') o.clear();
        if (SINGLE[s]) { if (v && (mode === 'replace' || !existing[s])) o.put(v); }
        else (v || []).forEach(function (r) { o.put(r); });
      });
      if (mode === 'replace') t.objectStore('state').clear();
    });
  };

  DB.clearAll = function () {
    var names = Engine.STORES.concat(['state']);
    return DB.tx(names, 'readwrite', function (t) { names.forEach(function (s) { t.objectStore(s).clear(); }); });
  };

  root.DB = DB;
})(window);
