# Supervised accessibility — device validation

The build, device result, and evidence references are recorded below. This test uses a disposable local emulator, not a personal device. No test fixtures, instrumentation hooks, credential, or QA Activity are compiled into the production APK.

## Replay on a dedicated scratch AVD

1. Build a normal debug APK with `./gradlew --offline :app:assembleDebug` (not `-PsmokeOnly`). Set `ANDROID_HOME` and `ANDROID_SERIAL` explicitly. Use the same standard debug signing key for the two optional QA APKs: `bash qa/e2e/build-fixtures.sh /tmp/pilot-qa-apks`. Install the three with `adb -s "$ANDROID_SERIAL" install -r <apk>` one at a time.
2. Enable Pilot's accessibility service and “display over other apps” on this scratch device in Android settings. In Pilot, choose an ordinary target. Tap **打开应用**, review the *native* target/step preview, decline once, and confirm on a second pass. The target must **not** launch until the operator taps **下一步** in the external overlay. Verify the four rails, confirmation and Stop; observe the foreground package and overlay teardown. Repeat and tap **停止** before the first step; launch must not occur.
3. Optional deterministic model: `adb -s "$ANDROID_SERIAL" shell am instrument -w qa.pilot.model/.PlanFixture` launches the real debug product under a test-only runner. It sets the public custom-provider configuration to an offline `.invalid` URL, mocks ONLY the model's HTTP response in that process, and launches MainActivity. It never supplies a target, creates/starts a session, clicks a control, or grants a permission. Select **Reading Shelf** (`qa.pilot.reader`) through the real native chooser. Type a short instruction in the real task box and tap **执行任务**. Review the native 3-step plan; then issue a separate finger tap after reviewing each overlay prompt. Check the fixture UI and `adb logcat -s ShelfFixture:I PilotPlanFixture:I`: Details changes an independent label; the first positive scroll from top emits a separate marker. Repeat, switch to Home before the pending click, and check for overlay removal and absence of a new action.
4. Optional `qa/e2e/observe.py`: set `ADB`, `ANDROID_SERIAL`, and exact `TEST_AVD`. Use `python3 qa/e2e/observe.py /tmp/pilot-evidence show NAME` for a host-side emulator-display PNG, `windows NAME` for a WindowManager dump, and `focus` for the foreground. With the explicitly reviewed control coordinates, `finger X Y` represents a touch on the virtual digitizer; **do not** tap inside the target app while testing action effects. Ordinary Android screen capture may be black for `FLAG_SECURE` windows. Do not disable that flag or use UIAutomator while the Pilot service is being tested (it can suppress accessibility services).
5. Remove the instrumentation / target fixture and revoke grants or discard the AVD. No live provider credentials or network calls are needed. A real vendor model, physical device, OEM-specific prompts and the signed release are outside this test.

## Results

Executed on a software-emulator AVD (API 29 / Android 10). Verified evidence in `e2e/evidence/`:

- `grants.txt` — Pilot's accessibility service bound and enabled; `SYSTEM_ALERT_WINDOW: allow`.
- `device.png` — real device display capture: app renders the prism hero, Chinese copy and three-tab navigation with no white screen, crash or garbled text.
- `apk.sha256`, `fixtures.sha256` — hashes of the exact APKs used.
- Separate instrumentation run (`instrumentation-evidence/run-035945/instrument.txt`) — `OK (13 tests)`.

Credential-dependent model/search calls, physical-device OEM behavior and the signed release install are **not** covered here; see `docs/VALIDATION.md`. A successful Gradle build alone is not a pass for any behavior above.
