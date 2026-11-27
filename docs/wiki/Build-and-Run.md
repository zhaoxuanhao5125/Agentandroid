# 构建与运行

本页介绍如何从源码构建最新归档版本。若项目脚本或环境要求有变化，请以 [`v3.7/README.md`](../../v3.7/README.md) 和 [`v3.7/docs/BUILD.md`](../../v3.7/docs/BUILD.md) 为准。

## 环境要求

- JDK 17
- Android SDK Platform 34
- Android Build Tools 34.0.0

## 构建 Debug APK

在仓库根目录执行：

```bash
cd v3.7
./gradlew :app:assembleDebug
```

生成文件：

```text
v3.7/app/build/outputs/apk/debug/app-debug.apk
```

也可以运行常用检查任务：

```bash
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
./gradlew :app:lintDebug
```

需要构建 Release 时：

```bash
./gradlew :app:assembleRelease
```

普通 Release 构建生成的是未签名 APK。签名和发布流程请查阅 [`v3.7/docs/RELEASE.md`](../../v3.7/docs/RELEASE.md)（如果该文件名有变动，请以 v3.7/docs 中的实际文档为准）。

## 安装和首次体验

可以从可信的项目 Release 获取 APK。按应用提示配置模型或搜索服务；如需控制其他应用，再由用户在 Android 系统设置中授予所需权限。

## 常见提示

- 请从 `v3.7/` 目录运行 Gradle Wrapper，而不是从仓库根目录运行。
- 确认本机 Android SDK 与 Build Tools 版本符合要求。
- API 密钥和签名私钥不要提交到 Git 仓库。
- 发布 APK 前，请按项目文档完成签名与验证。

## 延伸阅读

- [v3.7 README](../../v3.7/README.md)
- [构建文档](../../v3.7/docs/BUILD.md)
- [发布文档](../../v3.7/docs/RELEASE.md)
