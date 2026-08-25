# 轻待办

轻待办是一款常驻桌面的中文待办小组件，基于 Electron 构建。它支持日期筛选、紧凑模式、今日任务轮播、明暗主题和本地持久化，不需要账号，也不会联网同步待办内容。

本项目基于 [singharyan006/flost8](https://github.com/singharyan006/flost8) 修改，遵循原项目的 MIT License，并保留原作者版权声明。

## 功能

- 添加、编辑、完成和删除待办
- 按上一天、今天、下一天或全部日期查看
- 新建待办自动归入当前选中的日期
- 紧凑模式大字轮播今日未完成任务
- 紧凑窗口可拖动，独立“展开”按钮恢复完整界面
- 窗口置顶、明暗主题、本地保存

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm ci
npm start
```

开发模式：

```bash
npm run dev
```

Windows 打包：

```bash
npm run build:win
```

联网轻量安装器（小 EXE，安装时从 GitHub 下载运行环境）：

```bash
npm run build:win:web
```

生成文件位于 `dist/`。

## 安全设计

- Electron 渲染沙箱与上下文隔离
- 禁用渲染层 Node.js 集成
- 内容安全策略禁止外部脚本和网络连接
- 使用受限的自定义协议加载本地资源
- IPC 调用验证来源并限制可读写配置键
- 任务文本纯文本渲染，并限制数量与长度
- 生产构建关闭 Node 模式、`NODE_OPTIONS` 和调试入口
- 仅从 ASAR 加载应用，并验证嵌入式 ASAR 完整性
- CI 构建前执行依赖漏洞审计

待办数据以明文形式保存在本机用户配置目录中，请勿记录密码、令牌等敏感信息。

## GitHub Release

仓库工作流支持手动运行，也会在推送 `v*` 标签时构建 Windows 和 macOS 版本并创建 Release：

```bash
git tag v2.0.0
git push origin v2.0.0
```

默认产物未使用商业代码签名证书。Windows 可能显示“未知发布者”，macOS 也可能阻止未签名应用。公开发布前建议配置 Windows Authenticode 和 Apple Developer ID 签名。

## 许可证与署名

本项目采用 [MIT License](LICENSE)。原始项目由 Aryan Singh 创建；修改版本继续保留原许可证和署名。

