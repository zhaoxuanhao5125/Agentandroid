#!/usr/bin/env bash
# Build two test-only APKs outside the production source sets; no extra gradle modules or dependencies.
set -eu
here=$(cd "$(dirname "$0")" && pwd); out=${1:?Usage: build-fixtures.sh SCRATCH_OUTPUT_DIRECTORY}; mkdir -p "$out"; out=$(cd "$out" && pwd)
sdk=${ANDROID_HOME:?Set ANDROID_HOME}; bt=$sdk/build-tools/34.0.0; jar=$sdk/platforms/android-34/android.jar
ks=${ANDROID_USER_HOME:-$HOME/.android}/debug.keystore; [[ -f $ks ]] || { echo 'Build the debug app first (same signing key)' >&2; exit 2; }
w=$(mktemp -d); trap 'rm -rf "$w"' EXIT
for f in reader model; do
  mkdir -p "$w/$f/classes" "$w/$f/dex"
  "$bt/aapt2" link -I "$jar" -o "$w/$f/base.apk" --manifest "$here/$f.xml" --min-sdk-version 29 --target-sdk-version 34
  javac -source 8 -target 8 -Xlint:-options -bootclasspath "$jar" -classpath "$bt/core-lambda-stubs.jar" -d "$w/$f/classes" "$here/src/qa/pilot/$f/"*.java
  jar cf "$w/$f/classes.jar" -C "$w/$f/classes" .
  "$bt/d8" --min-api 29 --lib "$jar" --output "$w/$f/dex" "$w/$f/classes.jar"
  (cd "$w/$f/dex"; zip -q -0 "$w/$f/base.apk" classes.dex)
  "$bt/zipalign" -f 4 "$w/$f/base.apk" "$w/$f/aligned.apk"
  "$bt/apksigner" sign --ks "$ks" --ks-pass pass:android --key-pass pass:android --v4-signing-enabled false --out "$out/$f.apk" "$w/$f/aligned.apk"
done
