# Zzz 的工作站

Windows 本地优先、离线可用的个人工作台。第一期包含加密本地数据、任务列表/看板、Markdown 笔记、提示词模板、番茄钟、今日总览、周报导出、托盘快捷入口与加密备份恢复。

## 开发与打包

```powershell
npm install
npm start
npm run package
npm run make
```

`npm run package` 会生成可直接运行的 Windows 应用；`npm run make` 会额外生成 Squirrel 安装包。

## 数据与安全

- 首次启动必须创建主密码；密码不会写入磁盘，忘记后无法恢复数据。
- 数据库、附件与设置位于 `%APPDATA%\Zzz Workstation`，数据库使用 SQLCipher 兼容加密。
- 手动导出的 `.zip` 备份包含加密数据库、密钥信封与附件，可在另一台机器上通过原主密码恢复。
- 卸载应用时会永久清除上述应用数据目录；手动导出到其他位置的备份不会被删除。
- 第一期开箱即离线，不包含云同步、邮件、日历、RSS 或 GitHub 集成。
