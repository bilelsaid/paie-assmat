// Phase 2 (AppGallery) : APK signé par une clé propre, sans Google, fiche et confidentialité.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('AG1 FR-8 : aucune dépendance Google ni permission réseau', () => {
  const g = read('app/build.gradle'), m = read('app/src/main/AndroidManifest.xml');
  assert.ok(!/com\.google|gms|firebase|play-services/i.test(g), 'dépendance Google dans build.gradle');
  assert.ok(!/INTERNET/.test(m), 'permission INTERNET');
  assert.ok(!fs.existsSync(path.join(root, 'app', 'google-services.json')));
  assert.ok(!/com\.google|gms|firebase/i.test(read('build.gradle') + read('settings.gradle')));
});

test('AG2 FR-8, D5 : signature release par clé propre, lue dans l\'environnement, jamais committée', () => {
  const g = read('app/build.gradle');
  assert.ok(/signingConfigs\s*\{[\s\S]*release/.test(g) && /System\.getenv\('ANDROID_KEYSTORE_FILE'\)/.test(g) && /signingConfig\s+signingConfigs\.release/.test(g));
  assert.ok(!/storePassword\s+["'][^"']+["']/.test(g), 'mot de passe en dur');
  const ig = read('.gitignore'); assert.ok(/\*\.jks/.test(ig) && /\*\.keystore/.test(ig));
  const tracked = cp.execSync('git ls-files', { cwd: root }).toString();
  assert.ok(!/\.(jks|keystore|p12)$/m.test(tracked), 'clé committée');
});

test('AG3 : nom de paquet figé', () => {
  assert.ok(/applicationId "com\.bilel\.paieassmat"/.test(read('app/build.gradle')));
});

test('AG4 FR-8 : la CI compile le release, le signe (clé de secours si pas de secret) et vérifie la signature', () => {
  const wf = read('.github/workflows/build-apk.yml');
  assert.ok(/assembleRelease/.test(wf) && /apksigner verify/.test(wf) && /ANDROID_KEYSTORE_B64/.test(wf) && /keytool/.test(wf));
});

test('AG5 fiche AppGallery : anglais, avertissement « indicatif », aucun autre store, aucune collecte', () => {
  const l = read('store/appgallery/listing-en.md'), p = read('store/appgallery/privacy-policy-en.md');
  assert.ok(/indicative/i.test(l) && /not legal advice/i.test(l));
  assert.ok(!/google play|play store|app store|apple/i.test(l), 'mention d\'un autre store');
  assert.ok(/outside mainland China|not.*HarmonyOS NEXT/i.test(l), 'limite Chine/HarmonyOS NEXT');
  assert.ok(/does not collect/i.test(p) && /never leaves your device/i.test(p) && /child/i.test(p));
});

test('AG6 icône 216 × 216', () => {
  const b = fs.readFileSync(path.join(root, 'store', 'appgallery', 'icon-216.png'));
  assert.equal(b.toString('latin1', 1, 4), 'PNG'); assert.equal(b.readUInt32BE(16), 216); assert.equal(b.readUInt32BE(20), 216);
});

test('AG7 NFR-8 : CSP default-src \'self\' dans index.html', () => {
  const h = read('app/src/main/assets/index.html');
  assert.ok(/http-equiv="Content-Security-Policy"[^>]*default-src 'self'/.test(h));
  assert.ok(/object-src 'none'/.test(h));
});
