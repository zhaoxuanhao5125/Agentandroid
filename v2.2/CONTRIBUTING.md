# 参与开发

1. 先阅读 [构建说明](docs/BUILD.md) 和 [权限边界](SECURITY.md)，在 Android Studio 打开项目根目录，使用 JDK 17。
2. 页面资源在 `app/src/main/assets/ui/`；`MainActivity` 只向受限的本机页面提供桥接，不能加载第三方页面。原生执行器、服务适配器、技能验证及计划解析位于 `app/src/main/java/io/pilot/onething/`。
3. 新增技能通常只需更改 `skills.json`；可导入的同类示例见 `examples/`。变更服务响应格式时请增加无密钥 fixture 测试。
4. 提交前构建 debug 和 release；对无障碍或浮层改动，在测试机验证撤销、错误目标、锁屏与取消。不要为了让演示成功而取消逐步确认。
5. Pull request 写明测试的 API 等级和验证范围。不提交 `local.properties`、证书私钥、令牌、构建目录、用户数据或 APK；二进制请放 GitHub Release。

项目原创代码、文档和图形使用 MIT；Gradle Wrapper 使用其原始许可证。用户导入的技能、第三方服务和品牌名称不因此重新授权。
