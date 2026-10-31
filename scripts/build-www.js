#!/usr/bin/env node
// Prépare le dossier web embarqué par Capacitor (iOS) : mêmes fichiers que le web, sans service worker ni manifeste,
// avec la coquille iOS chargée entre db.js et platform.js. Usage : node scripts/build-www.js [dossier de sortie]
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'app', 'src', 'main', 'assets');
const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'www'));
const SKIP = new Set(['sw.js', 'manifest.webmanifest']);
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
fs.readdirSync(src).filter(f => !SKIP.has(f)).forEach(f => fs.copyFileSync(path.join(src, f), path.join(out, f)));
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
html = html.replace(/<link rel="manifest"[^>]*>\n?/, '');
if (!html.includes('<script src="db.js"></script>')) throw new Error('index.html : db.js introuvable');
html = html.replace('<script src="db.js"></script>', '<script src="db.js"></script>\n<script src="platform-ios.js"></script>');
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('www prêt : ' + out);
