#!/usr/bin/env bash
# Run real provider adapters on a host JVM; no emulator or API keys required.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
cache=${PROVIDER_TEST_CACHE:-${XDG_CACHE_HOME:-$HOME/.cache}/pilot-provider-fixtures}
mkdir -p "$cache"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
version=6.0.1_r3-robolectric-r1
base=https://repo.maven.apache.org/maven2/org/robolectric/android-all/$version/android-all-$version
fetch() {
  local file=$1 suffix=$2 digest=$3
  if [[ ! -f "$cache/$file" ]] || ! printf '%s  %s\n' "$digest" "$cache/$file" | sha256sum --check --status; then
    curl --fail --location --retry 2 --max-time 180 "$base$suffix.jar" -o "$tmp/$file"
    printf '%s  %s\n' "$digest" "$tmp/$file" | sha256sum --check --status
    mv "$tmp/$file" "$cache/$file"
  fi
}
fetch android-all.jar '' a2d84271c5f033b1d082741a02f37a2d043120c0c09e5854e97ece9c3bb11d31
fetch sources.jar -sources b63b345627fa51fec2f09d9af2f9295b69d6fdc1de55b10391965f8e0633e910
jarfile=$(cd "$cache" && pwd)/android-all.jar
sources=$(cd "$cache" && pwd)/sources.jar
cd "$tmp"
# Android bytecode calls a Dalvik-specific typed arraycopy overload. Recompile
# these two unmodified Android sources against the host JDK, not replacement mocks.
jar xf "$sources" android/util/JsonReader.java libcore/internal/StringPool.java
mkdir classes
javac --release 8 -Xlint:-options -cp "$jarfile" -d classes android/util/JsonReader.java libcore/internal/StringPool.java \
    "$root/app/src/main/java/io/pilot/onething/Backend.java" "$here/ProviderFixtures.java"
java -cp "classes:$jarfile" io.pilot.onething.ProviderFixtures
