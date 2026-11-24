#!/usr/bin/env bash
# Optional isolated on-device credential test. Pass the test device's adb serial.
set -euo pipefail
serial=${1:?Usage: tests/providers/device.sh DEVICE_SERIAL}
here=$(cd "$(dirname "$0")" && pwd); root=$(cd "$here/../.." && pwd)
sdk=${ANDROID_HOME:-$HOME/.cache/pilot-android/sdk}; bt="$sdk/build-tools/34.0.0"; android="$sdk/platforms/android-34/android.jar"
adb=("$sdk/platform-tools/adb" -s "$serial"); pkg=io.pilot.onefixture
if "${adb[@]}" shell pm path "$pkg" | grep -q '^package:'; then echo "Fixture package already installed; refusing to replace it." >&2; exit 2; fi
work=$(mktemp -d); installed=0
cleanup(){ if [[ $installed == 1 ]]; then "${adb[@]}" uninstall "$pkg" >/dev/null || true; fi; rm -rf "$work"; }
trap cleanup EXIT
cd "$work"; mkdir classes dex
cat > AndroidManifest.xml <<EOF
<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="$pkg">
<application android:allowBackup="false" android:label="Pilot KeyStore fixture"/>
<instrumentation android:name="io.pilot.onething.KeystoreFixtures" android:targetPackage="$pkg"/>
</manifest>
EOF
"$bt/aapt2" link -I "$android" -o base.apk --manifest AndroidManifest.xml --min-sdk-version 29 --target-sdk-version 34 --version-code 1 --version-name 1
javac -encoding UTF-8 -source 8 -target 8 -Xlint:-options -bootclasspath "$android" -classpath "$bt/core-lambda-stubs.jar" -d classes \
  "$root/app/src/main/java/io/pilot/onething/Backend.java" "$here/KeystoreFixtures.java"
jar cf classes.jar -C classes .
"$bt/d8" --debug --min-api 29 --lib "$android" --output dex classes.jar
jar uf base.apk -C dex classes.dex
"$bt/zipalign" -f 4 base.apk aligned.apk
keytool -genkeypair -keystore tmp.p12 -storepass android -alias test -keyalg RSA -keysize 2048 -validity 1 -dname CN=PilotFixture >/dev/null 2>&1
"$bt/apksigner" sign --ks tmp.p12 --ks-pass pass:android --out signed.apk aligned.apk
"${adb[@]}" install -t signed.apk
installed=1
"${adb[@]}" shell am instrument -w "$pkg/io.pilot.onething.KeystoreFixtures" | tee result.txt
grep -q 'PASSED: AndroidKeyStore' result.txt
