/* Interface Platform : tout ce qui dépend de la cible (web, Android/AppGallery, iOS).
   app.js n'appelle que cette interface ; une coquille native ajoute son implémentation ici. */
(function (root) {
  'use strict';
  var APP_VERSION = '1.2.0';
  var A = root.Android || null;
  var cap = root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform();
  var P = { APP_VERSION: APP_VERSION, target: A ? 'android' : (cap ? 'ios' : 'web') };

  P.storage = root.DB; // iOS : remplacé par l'adaptateur SQLite (phase 3)

  P.prefs = {
    get: function (k) { try { return root.localStorage.getItem('paie.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { root.localStorage.setItem('paie.' + k, v); } catch (e) { /* ignore */ } }
  };

  P.persistence = async function () {
    if (P.target !== 'web') return { supported: true, persisted: true };
    if (!(root.navigator.storage && root.navigator.storage.persisted)) return { supported: false, persisted: null };
    try { return { supported: true, persisted: await root.navigator.storage.persisted() }; } catch (e) { return { supported: false, persisted: null }; }
  };
  P.requestPersistence = async function () {
    try { return !!(root.navigator.storage && root.navigator.storage.persist && await root.navigator.storage.persist()); } catch (e) { return false; }
  };

  P.files = {
    exportJSON: function (name, json) {
      if (A && A.exportFile) { A.exportFile(name, json); return; }
      var a = root.document.createElement('a');
      a.href = root.URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name;
      root.document.body.appendChild(a); a.click(); a.remove();
      root.onExportResult(true);
    },
    importJSON: function () {
      if (A && A.importFile) { A.importFile(); return; }
      var el = root.document.getElementById('bk-file');
      if (el) el.click();
    }
  };

  P.share = {
    available: function () { return !!((A && A.share) || (root.navigator && root.navigator.share)); },
    text: function (t) {
      if (A && A.share) A.share(t);
      else if (root.navigator.share) root.navigator.share({ text: t }).catch(function () { /* annulé */ });
    }
  };

  P.canPrint = P.target === 'web';

  // Service worker (web uniquement). onUpdate(apply) est appelé quand une nouvelle version est prête.
  P.registerServiceWorker = function (onUpdate) {
    if (P.target !== 'web' || !('serviceWorker' in root.navigator) || !/^https?:$/.test(root.location.protocol)) return;
    root.navigator.serviceWorker.register('sw.js').then(function (reg) {
      var offer = function (w) {
        if (!w || !root.navigator.serviceWorker.controller) return;
        onUpdate(function () { w.postMessage('skip'); });
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', function () {
        var w = reg.installing;
        if (w) w.addEventListener('statechange', function () { if (w.state === 'installed') offer(w); });
      });
    }).catch(function () { /* hors ligne désactivé, l'appli reste utilisable */ });
    var reloaded = false, hadController = !!root.navigator.serviceWorker.controller;
    root.navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadController && !reloaded) { reloaded = true; root.location.reload(); } });
  };

  root.Platform = P;
})(window);
