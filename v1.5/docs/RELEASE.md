# 安装、长期签名和 GitHub

交付的 `pilot-one-thing-1.5.apk` 使用本次交付的专用签名，不是调试 APK；源码不包含任何私钥。**正式运营自己的开源项目时，请以你自己长期保管的签名密钥发布第一个公开版本。** 签名不同不能直接覆盖安装。若从交付版切换到自签版，需要卸载旧版，或使用不同 applicationId 并行安装。卸载会清除配置、密钥及用户技能，先保留自己的原始 Key、设置和技能文件。

## 自行签名

最方便：Android Studio → Build → Generate Signed App Bundle or APK → APK，选择或创建自己的 keystore，妥善离线备份。命令行示例（在项目根目录；密码使用交互输入）：

```sh
# 私钥放在源码外，绝不能上传 GitHub。
mkdir -p "$HOME/.pilot-signing"
chmod 700 "$HOME/.pilot-signing"
keytool -genkeypair -keystore "$HOME/.pilot-signing/release.p12" -storetype PKCS12 \
  -alias pilot -keyalg RSA -keysize 3072 -validity 10000
./gradlew :app:assembleRelease
BT="$ANDROID_HOME/build-tools/34.0.0"
"$BT/zipalign" -f 4 app/build/outputs/apk/release/app-release-unsigned.apk /tmp/pilot-aligned.apk
"$BT/apksigner" sign --ks "$HOME/.pilot-signing/release.p12" --ks-key-alias pilot \
  --out pilot-one-thing-1.5.apk /tmp/pilot-aligned.apk
"$BT/apksigner" verify --verbose --print-certs pilot-one-thing-1.5.apk
sha256sum pilot-one-thing-1.5.apk
```

## 发布到 GitHub

在 GitHub 创建一个空仓库 `pilot-one-thing`，不要预置第二份 README 或 LICENSE。解压项目 ZIP，进入顶层工程目录；可以先用 `git status --short --ignored` 核对没有凭据。以下按你选择的 GitHub 账户执行：

```sh
git init -b main
git add .
git commit -m "Initial release of pilot one thing"
# gh CLI 已登录且尚未创建远端时：
gh repo create pilot-one-thing --public --source=. --remote=origin --push
# 若远端已经创建，改为 git remote add origin <你的仓库地址>，然后 git push -u origin main。
```

请只执行上述两种建库方式之一。推送后 Actions 会编译应用和测试 APK；CI 的临时 debug 签名不适合公开版本。可用 GitHub Releases 上传**自己签名**的 APK 和对应 SHA-256。此工程未声明已通过 Google Play 的无障碍政策审核，上架商店需要单独遵守适用规则。
