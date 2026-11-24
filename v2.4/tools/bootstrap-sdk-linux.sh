#!/usr/bin/env bash
# Linux x86_64: fetch the two versioned Google archives needed by build-debug.sh.
# Read the Android SDK license before use: https://developer.android.com/studio/terms
set -euo pipefail
[[ $(uname -s)/$(uname -m) == Linux/x86_64 ]] || { echo 'Use Android Studio or sdkmanager for your OS/architecture.' >&2; exit 1; }
sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-${XDG_CACHE_HOME:-$HOME/.cache}/pilot-android/sdk}}
mkdir -p "$sdk"; stage=$(mktemp -d "$sdk/.pilot-sdk.XXXXXX"); trap 'rm -rf -- "$stage"' EXIT
install_archive() {
  local name=$1 hash=$2 folder=$3 path=$4 required=$5
  if [[ -f "$sdk/$path/$required" ]]; then printf 'Already installed: %s\n' "$path"; return; fi
  if [[ -e "$sdk/$path" ]]; then echo "Incomplete SDK path: $sdk/$path; inspect before reinstalling." >&2; exit 1; fi
  curl --fail --location --retry 2 --proto '=https' --proto-redir '=https' --output "$stage/$name" "https://dl.google.com/android/repository/$name"
  (cd "$stage" && printf '%s  %s\n' "$hash" "$name" | sha256sum --check -)
  unzip -q "$stage/$name" -d "$stage"; test -f "$stage/$folder/$required"
  mkdir -p "$sdk/$(dirname "$path")"; mv -T "$stage/$folder" "$sdk/$path"
}
install_archive platform-34-ext7_r03.zip 16fdb74c55e59ae3ef52def135aec713508467bd56d7dabcd8c9be31fa8b20f3 android-34 platforms/android-34 android.jar
install_archive build-tools_r34-linux.zip e858c4b60069d0431051b225d384413b1643e1289b00a4825aed347f25bd510f android-14 build-tools/34.0.0 aapt2
printf 'SDK ready. For Gradle: export ANDROID_HOME=%q\n' "$sdk"
