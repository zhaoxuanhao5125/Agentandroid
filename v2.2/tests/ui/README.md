# 离线界面测试

此目录的脚本用 Chromium 打开 APK 内的同一套 HTML/CSS/JS。浏览器没有 Android 权限，测试通过受控桥接夹具检查 UI 请求和状态，不替代安卓系统或真实服务商测试。

需要 Node.js 22、Playwright（开发时验证使用 1.58.1）和 Chromium。它们是测试工具，不是 Android 运行依赖。

```sh
# 只在本机的测试目录安装开发依赖：
cd tests/ui
npm install --no-save --package-lock=false playwright@1.58.1
CHROMIUM=/usr/bin/chromium node verify-ui.cjs
```

覆盖主题：输入任务、选择技能、保存及删除密钥、切换提供方不串用草稿，Bing 与权限桥接、停止、减少动态效果、模型内容按纯文本渲染，以及五种宽度的四个页面横向溢出检查。临时截图由脚本写入系统临时目录；不会写入产品目录。
