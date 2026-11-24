#!/usr/bin/env bash
# Standalone build for this framework-only Java APK (no Gradle, Maven or network).
# Use Gradle for dependency/manifest merging, custom build types, or release signing.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
case "${1:-}" in
  '') src="$root/app/src/main"; output="$root/app/build/outputs/apk/standalone/app-debug.apk" ;;
  --smoke) src="$root/smoke/src/main"; output="$root/smoke/build/standalone/smoke-debug.apk" ;;
  *) echo 'Usage: tools/build-debug.sh [--smoke]' >&2; exit 2 ;;
esac
sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/pilot-android/sdk}}
bt="$sdk/build-tools/34.0.0"; android="$sdk/platforms/android-34/android.jar"
for tool in javac jar keytool python3; do command -v "$tool" >/dev/null || { echo "Missing: $tool" >&2; exit 1; }; done
[[ -f "$android" ]] || { echo "No android-34 platform in $sdk. Set ANDROID_HOME (see docs/BUILD.md)." >&2; exit 1; }
for tool in aapt2 d8 zipalign apksigner; do [[ -x "$bt/$tool" ]] || { echo "Missing $bt/$tool" >&2; exit 1; }; done
work=$(mktemp -d); trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work"/{gen,classes,dex} "$(dirname "$output")"
# Gradle supplies the manifest package for a namespace-only manifest; do likewise
# on a temporary copy. Never change app/src or add signing material to the repo.
python3 - "$src/AndroidManifest.xml" "$work/AndroidManifest.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
xml = ET.parse(sys.argv[1]); xml.getroot().set('package','io.pilot.onething')
xml.write(sys.argv[2], encoding='utf-8', xml_declaration=True)
PY
args=()
if [[ -d "$src/res" ]]; then "$bt/aapt2" compile --dir "$src/res" -o "$work/resources.zip"; args+=("$work/resources.zip"); fi
if [[ -d "$src/assets" ]]; then args+=(-A "$src/assets"); fi
"$bt/aapt2" link -I "$android" -o "$work/base.apk" --java "$work/gen" \
  --manifest "$work/AndroidManifest.xml" --min-sdk-version 29 --target-sdk-version 34 \
  --version-code 5 --version-name 1.4 --debug-mode "${args[@]}"
mapfile -d '' -t sources < <(find "$src/java" "$work/gen" -type f -name '*.java' -print0)
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -bootclasspath "$android" \
  -classpath "$bt/core-lambda-stubs.jar" -d "$work/classes" "${sources[@]}"
jar cf "$work/classes.jar" -C "$work/classes" .
"$bt/d8" --debug --min-api 29 --lib "$android" --output "$work/dex" "$work/classes.jar"
python3 - "$work" <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED
import sys
p = Path(sys.argv[1])
with ZipFile(p/'base.apk','a') as z:
    for f in sorted((p/'dex').glob('classes*.dex')): z.write(f, f.name, compress_type=ZIP_STORED)
PY
"$bt/zipalign" -f 4 "$work/base.apk" "$work/aligned.apk"
# Use the standard Android development keystore (never suitable for distribution).
ks="${ANDROID_USER_HOME:-$HOME/.android}/debug.keystore"
if [[ ! -e "$ks" ]]; then
  (umask 077; mkdir -p "$(dirname "$ks")"; keytool -genkeypair -keystore "$ks" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Android Debug,O=Android,C=US' >/dev/null)
fi
"$bt/apksigner" sign --ks "$ks" --ks-key-alias androiddebugkey --ks-pass pass:android \
  --key-pass pass:android --v4-signing-enabled false --out "$work/signed.apk" "$work/aligned.apk"
"$bt/apksigner" verify --verbose "$work/signed.apk"
"$bt/zipalign" -c 4 "$work/signed.apk"
cp "$work/signed.apk" "$output"; printf 'Built %s\n' "$output"
