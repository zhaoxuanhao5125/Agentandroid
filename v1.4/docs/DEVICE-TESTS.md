# Android instrumentation tests

Run these on a **disposable API 29+ emulator**. Installation updates the debug target; `am instrument` starts the target under instrumentation, interrupting any active Pilot UI or service. Do not use a personal device. Do not use `-PsmokeOnly`: these tests require the real app and real packaged assets. No AndroidX, JUnit, test account, key, provider subscription, or emulator root is required.

```sh
# From the project root. Set ANDROID_HOME as in BUILD.md.
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
ADB="$ANDROID_HOME/platform-tools/adb"
"$ADB" devices -l
# Replace with the intended disposable device's serial.
SERIAL=emulator-5580
"$ADB" -s "$SERIAL" install -r app/build/outputs/apk/debug/app-debug.apk
"$ADB" -s "$SERIAL" install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
"$ADB" -s "$SERIAL" shell am instrument -w -r \
  io.pilot.onething.test/io.pilot.onething.PilotDeviceTests
```

For automation, require the final `OK (13 tests)` line **and** `INSTRUMENTATION_CODE: -1`; a successful `adb` invocation alone is not a pass. Individual cases also emit standard instrumentation start/pass/fail status bundles.

## Scope

- `Skills.parseImport/accept/all/find`: schema projection, defaults, ID namespace, field limits, 24-item import limit, 14 bundled skills, replacements, 128-item custom catalog and rejection without partial persistence.
- `TaskPlan.parse` and `PilotGuard`: inert text, fenced JSON, the four accepted action types, exact per-action fields, order and size bounds; representative target, navigation, calculator and draft policy decisions. Does **not** enable accessibility, start an Activity, dispatch gestures, approve system prompts, or prove behavior of arbitrary third-party UIs.
- `Backend.state/save/chat/search`: exact public state shape, seven model and seven search profiles, atomic patches, real AndroidKeyStore AES key and actual encrypt/decrypt on device, same-origin retention, changed-host/port removal, explicit replacement/clearing, and independent search credentials. Tests supply only synthetic strings.
- The production worker, request construction, JSON parsing, result projection, redaction of HTTP diagnostics, size limit and error path run unchanged. A one-shot URL handler in the instrumented process substitutes in-memory `HttpsURLConnection` objects for HTTP(S); all unscripted calls are refused and counted as errors. Covers custom chat, five built-in search API adapters, Bing's API refusal, and custom GET/POST search. This is **not** a live provider, DNS, TLS/certificate, redirect-server, quota, latency or browser test.
- Preferences use fresh disk-backed names per case and are deleted afterward. The app's ordinary preferences and existing keys are not cleared. The normal AndroidKeyStore master alias may be initialized in the disposable target UID; the suite never deletes that alias. Normal app launches have no test URL handler. The test APK is not part of the production app.
