#!/usr/bin/env bash
# Build iOS sur simulateur (runner macOS). Génère le projet Capacitor, fixe le déploiement à iOS 15 (NFR-4), compile sans signature.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci || npm install
node scripts/build-www.js
[ -d ios ] || npx cap add ios
npx cap sync ios
# iOS 15 minimum : projet Xcode et Podfile (ou Package.swift) peuvent fixer une valeur plus basse.
grep -rl "IPHONEOS_DEPLOYMENT_TARGET" ios --include=project.pbxproj | xargs -I{} sed -i '' -E 's/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+;/IPHONEOS_DEPLOYMENT_TARGET = 15.0;/g' {}
[ -f ios/App/Podfile ] && sed -i '' -E "s/platform :ios, '[0-9.]+'/platform :ios, '15.0'/" ios/App/Podfile || true
[ -f ios/App/Podfile ] && (cd ios/App && pod install) || true
WS=$(ls -d ios/App/*.xcworkspace 2>/dev/null | head -1 || true)
if [ -n "$WS" ]; then TARGET=(-workspace "$WS"); else TARGET=(-project ios/App/App.xcodeproj); fi
xcodebuild "${TARGET[@]}" -scheme App -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
