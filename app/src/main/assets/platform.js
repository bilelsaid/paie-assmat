/* Interface Platform : tout ce qui dépend de la cible (web, Android/AppGallery, iOS).
   app.js n'appelle que cette interface ; une coquille native ajoute son implémentation ici. */
(function (root) {
  'use strict';
  var APP_VERSION = '1.5.0';
  var A = root.Android || null;
  var cap = root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform() && root.Capacitor.getPlatform && root.Capacitor.getPlatform() === 'ios';
  var P = { APP_VERSION: APP_VERSION, target: A ? 'android' : (cap ? 'ios' : 'web') };

  var IOS = root.IosShell && root.IosShell.active ? root.IosShell : null; // coquille iOS (platform-ios.js)
  P.ready = IOS ? IOS.ready : Promise.resolve();
  P.storage = root.DB; // iOS : platform-ios.js a déjà remplacé DB par l'adaptateur SQLite

  P.prefs = IOS ? IOS.prefs : {
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

  var binPending = null;
  root.onBinaryExportResult = function (ok) { var r = binPending; binPending = null; if (r) r(!!ok); };

  P.files = {
    exportJSON: function (name, json) {
      if (A && A.exportFile) { A.exportFile(name, json); return; }
      var a = root.document.createElement('a');
      a.href = root.URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = name;
      root.document.body.appendChild(a); a.click(); a.remove();
      root.onExportResult(true);
    },
    // Fichier binaire (PDF, PNG) : web = téléchargement, Android = création de document, iOS = feuille de partage. Résout true/false.
    exportBlob: function (name, mime, b64) {
      return new Promise(function (resolve) {
        if (A && A.exportBinary) { binPending = resolve; A.exportBinary(name, mime, b64); return; }
        try {
          var bin = root.atob(b64), u = new Uint8Array(bin.length), i;
          for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          var a = root.document.createElement('a');
          a.href = root.URL.createObjectURL(new Blob([u], { type: mime })); a.download = name;
          root.document.body.appendChild(a); a.click(); a.remove();
          resolve(true);
        } catch (e) { resolve(false); }
      });
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

  if (IOS) { P.files.exportJSON = IOS.files.exportJSON; P.files.exportBlob = IOS.files.exportBlob; P.share = IOS.share; }

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
