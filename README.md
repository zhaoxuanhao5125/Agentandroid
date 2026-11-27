# Agentandroid

> `pilot one thing` 的 Android 源码归档仓库
>
> 一个面向 Android 10+ 的中文手机助手：一次只做一件事，通过可检查的操作计划，协助完成手机导航、搜索、计算和日常写作等任务。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Android%2010%2B-blue.svg)](#)
[![Language](https://img.shields.io/badge/Language-Java-orange.svg)](#)

## 项目简介

本仓库归档了 **pilot-one-thing** 从 v1.4 到 v3.7 的完整源码快照。每个版本都是独立的 Android / Gradle 项目，可直接进入对应目录进行构建、阅读或运行。

> 当前最新源码：[`v3.7/`](v3.7/)

## 核心能力

- **任务指挥台**：查看任务状态、执行结果和最近活动，可中止正在进行的模型请求。
- **受控手机操作**：基于 Android AccessibilityService，每次只操作一个目标应用，并限制计划步骤，用户可逐步确认执行。
- **模型服务**：兼容 OpenAI 格式，并预置 DeepSeek、通义千问、硅基流动、Gemini、OpenRouter 等常用服务。
- **搜索能力**：支持 Bing、Tavily、Brave、Serper、博查、Exa，以及自定义 HTTPS 搜索端点。
- **技能系统**：内置手机导航、计算、翻页、草稿、写作、规划和检索技能，并支持从本地 JSON 导入自定义技能。
- **透明交互**：界面展示折射玻璃视觉效果、执行状态和停止控制，不依赖模拟器或隐藏后台代理。

## 快速开始

### 使用构建好的版本

从可信的项目 Release 下载对应 APK，并在 Android 10 或更高版本的设备上安装。界面和免费 Bing 搜索无需授予设备控制权限即可体验。

如果需要模型或设备操作能力，请分别进入：

1. **连接 → 模型服务**：选择服务商、填写密钥并测试连接。
2. **搜索服务**：配置需要的搜索 API 或使用内置 Bing 入口。
3. **设备**：选择目标应用，并在系统设置中按提示授予无障碍与悬浮窗权限。

> 模型只能依据任务、技能和目标应用标识生成操作计划，不会读取屏幕截图或页面树。

### 从源码构建

环境要求：JDK 17、Android SDK Platform 34、Build Tools 34.0.0。

```bash
cd v3.7
./gradlew :app:assembleDebug
```

调试 APK 位于：

```text
v3.7/app/build/outputs/apk/debug/app-debug.apk
```

常用检查与构建命令：

```bash
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
./gradlew :app:lintDebug
./gradlew :app:assembleRelease
```

普通 `release` 构建产出未签名 APK；如需签名发布，请阅读最新版本中的构建文档。

## 最新版本文档

- [`v3.7` 项目说明](v3.7/README.md)
- [更新日志](v3.7/CHANGELOG.md)
- [接口约定](v3.7/SERVICES.md)
- [构建说明](v3.7/docs/BUILD.md)
- [设备测试](v3.7/docs/DEVICE-TESTS.md)
- [安全与隐私](v3.7/SECURITY.md)
- [贡献指南](v3.7/CONTRIBUTING.md)

## 源码版本索引

| 版本 | 源码目录 | 文件数 | 源码大小 |
|:---:|:---|---:|---:|
| v1.4 | [`v1.4/`](v1.4/) | 74 | 671.7 KB |
| v1.5 | [`v1.5/`](v1.5/) | 75 | 685.4 KB |
| v1.6 | [`v1.6/`](v1.6/) | 75 | 691.0 KB |
| v1.7 | [`v1.7/`](v1.7/) | 76 | 700.0 KB |
| v1.8 | [`v1.8/`](v1.8/) | 76 | 779.6 KB |
| v1.9 | [`v1.9/`](v1.9/) | 76 | 784.2 KB |
| v2.0 | [`v2.0/`](v2.0/) | 91 | 1025.5 KB |
| v2.1 | [`v2.1/`](v2.1/) | 92 | 894.7 KB |
| v2.2 | [`v2.2/`](v2.2/) | 92 | 897.5 KB |
| v2.3 | [`v2.3/`](v2.3/) | 92 | 900.3 KB |
| v2.4 | [`v2.4/`](v2.4/) | 92 | 903.5 KB |
| v3.0 | [`v3.0/`](v3.0/) | 92 | 922.4 KB |
| v3.1 | [`v3.1/`](v3.1/) | 92 | 931.0 KB |
| v3.2 | [`v3.2/`](v3.2/) | 92 | 945.4 KB |
| v3.3 | [`v3.3/`](v3.3/) | 92 | 959.7 KB |
| v3.4 | [`v3.4/`](v3.4/) | 92 | 968.3 KB |
| v3.5 | [`v3.5/`](v3.5/) | 92 | 979.8 KB |
| v3.6 | [`v3.6/`](v3.6/) | 92 | 987.2 KB |
| v3.7 | [`v3.7/`](v3.7/) | 93 | 1020.8 KB |

共归档 **19** 个版本。每个目录都是该版本的完整源码快照。

## 仓库使用建议

- 新的构建、测试或二次开发请以 `v3.7/` 为起点。
- 历史目录只作为版本归档和差异对比使用，不建议混合不同版本的源码。
- 测试 Fixture 不应作为正式安装包发布。
- 不要提交 API Key、私钥或其他敏感凭据。
- APK 二进制文件建议通过 GitHub Releases 分发。

## 许可证

本仓库采用 [MIT License](LICENSE)，版本目录内如有独立许可证文件，以其对应目录为准。

## 免责声明

第三方模型和搜索服务有各自的资费、条款及地区可用性。本项目与 Apple、Google、Microsoft 或列出的第三方服务商无隶属关系。使用手机辅助操作时，请遵守目标应用条款，并始终确认高风险操作。
