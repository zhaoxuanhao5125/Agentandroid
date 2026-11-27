# Agentandroid Wiki

欢迎来到 **Agentandroid / pilot-one-thing** 项目 Wiki。本项目是面向 Android 10+ 的中文手机助手，围绕「一次，只做一件事」的理念，将模型能力、技能和经过确认的手机操作计划结合起来。

> 当前最新归档源码：[`v3.7/`](../../v3.7/)

## Wiki 导航

- [项目介绍与主要功能](Features.md)
- [构建与运行](Build-and-Run.md)
- [权限、安全与隐私](Security-and-Privacy.md)
- [源码版本与归档说明](Versions.md)

## 项目是什么

Agentandroid 支持任务输入、技能选择、模型服务配置、搜索，以及有限范围内的辅助操作计划。涉及手机操作时，应用通过 Android AccessibilityService 与用户授予的系统权限协作，并提供可检查、逐步确认的执行流程。

它不是一个可任意读取屏幕并自行操作所有应用的代理。使用者应先审阅计划，并对重要操作保持确认。

## 快速入口

- [主 README](../../README.md)
- [v3.7 项目说明](../../v3.7/README.md)
- [更新日志](../../v3.7/CHANGELOG.md)
- [接口约定](../../v3.7/SERVICES.md)
- [构建说明](../../v3.7/docs/BUILD.md)
- [安全与隐私说明](../../v3.7/SECURITY.md)

## 版本

仓库包含从 v1.4 到 v3.7 的 19 个源码快照。版本目录彼此独立；新开发和构建建议从最新归档版本 v3.7 开始。详见[版本说明](Versions.md)。
