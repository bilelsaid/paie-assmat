// Faux Capacitor (SQLite, Preferences, Filesystem, Share) pour tester l'adaptateur iOS sans appareil.
// Fonction autonome : elle est aussi injectée telle quelle dans le navigateur (toString).
// Hypothèse non vérifiée ici : les formes d'appel du plugin @capacitor-community/sqlite (voir README).
module.exports = function makeFakeCapacitor(store, platform) {
  var log = [], files = {};
  function load() { return JSON.parse(store.get('sql') || '{}'); }
  function save(m) { store.set('sql', JSON.stringify(m)); }
  function apply(m, stmt, v) {
    stmt = stmt.replace(/\s+/g, ' ').trim(); v = v || [];
    if (/^INSERT OR REPLACE INTO kv\(store, ?key, ?json\) VALUES ?\(\?, ?\?, ?\?\)$/i.test(stmt)) { m[v[0] + '\u0000' + v[1]] = v[2]; return []; }
    if (/^DELETE FROM kv WHERE store ?= ?\? AND key ?= ?\?$/i.test(stmt)) { delete m[v[0] + '\u0000' + v[1]]; return []; }
    if (/^DELETE FROM kv WHERE store ?= ?\?$/i.test(stmt)) { Object.keys(m).forEach(function (k) { if (k.split('\u0000')[0] === v[0]) delete m[k]; }); return []; }
    if (/^SELECT json FROM kv WHERE store ?= ?\? AND key ?= ?\?$/i.test(stmt)) { var j = m[v[0] + '\u0000' + v[1]]; return j === undefined ? [] : [{ json: j }]; }
    if (/^SELECT json FROM kv WHERE store ?= ?\? ORDER BY key$/i.test(stmt)) {
      return Object.keys(m).filter(function (k) { return k.split('\u0000')[0] === v[0]; }).sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; }).map(function (k) { return { json: m[k] }; });
    }
    throw new Error('SQL non pris en charge par le faux plugin : ' + stmt);
  }
  var SQL = {
    createConnection: async function () { log.push('createConnection'); },
    open: async function () { log.push('open'); },
    execute: async function (o) { if (!/CREATE TABLE IF NOT EXISTS kv/i.test(o.statements)) throw new Error('execute : ' + o.statements); return { changes: { changes: 0 } }; },
    executeSet: async function (o) { var m = load(); o.set.forEach(function (s) { apply(m, s.statement, s.values); }); save(m); return { changes: { changes: o.set.length } }; },
    run: async function (o) { var m = load(); apply(m, o.statement, o.values); save(m); return { changes: { changes: 1 } }; },
    query: async function (o) { return { values: apply(load(), o.statement, o.values) }; }
  };
  var Preferences = {
    get: async function (o) { var v = store.get('pref.' + o.key); return { value: v === undefined ? null : v }; },
    set: async function (o) { store.set('pref.' + o.key, o.value); },
    remove: async function (o) { store.set('pref.' + o.key, null); }
  };
  var Filesystem = { writeFile: async function (o) { files[o.path] = o.data; log.push('writeFile:' + o.directory + ':' + o.path); return { uri: 'file:///cache/' + o.path }; } };
  var Share = { share: async function (o) { log.push('share:' + JSON.stringify(o)); if (store.get('share.cancel') === '1') throw new Error('Share canceled'); return { activityType: 'x' }; } };
  return {
    isNativePlatform: function () { return platform !== 'web'; },
    getPlatform: function () { return platform; },
    Plugins: { CapacitorSQLite: SQL, Preferences: Preferences, Filesystem: Filesystem, Share: Share },
    __log: log, __files: files
  };
};
