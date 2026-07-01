# AI Usage Plugin

本地 AI 用量看板插件，支持 Claude Code 和 Codex CLI 的 Token 消耗统计与可视化。

数据全部读取自本机文件，**不联网、不上传、零隐私风险**。

---

## 这个插件能做什么？

- 在对话中直接查看今天/昨天/近 7 天/近 30 天的 Token 用量和费用
- 一键部署本地 Web 看板，查看每日趋势图、模型用量排行
- 支持 Claude Code（`~/.claude/projects/`）和 Codex CLI（`~/.codex/sessions/`）双数据源

---

## 前置要求

安装前请确认你的电脑已安装：

| 工具 | 用途 | 安装方式 |
|------|------|---------|
| Node.js 18+ | 运行看板服务 | [nodejs.org](https://nodejs.org) |
| Git | 拉取看板代码 | [git-scm.com](https://git-scm.com) |
| PM2 | 后台持久运行（**可选**） | 安装时由插件引导选择 |

> **只有 Node.js 和 Git 是必须的。** PM2 在执行 `/local-usage:init` 时会询问你的偏好，可以选择全局安装、项目级安装，或完全不装。

> **检查是否已安装：** 在终端运行 `node --version` 和 `git --version`，能看到版本号说明已安装。

---

## 安装步骤

在 Claude Code 中依次执行以下两条命令：

**第一步 — 添加插件来源：**
```
/plugin marketplace add https://github.com/yuhin-chiu/local-token-usage-plugin.git#main
```

**第二步 — 安装插件：**
```
/plugin install local-usage
```

安装完成后，重新加载插件：
```
/reload-plugins
```

---

## 命令一览

### `/local-usage:query` — 在对话中查看用量

无需启动看板，直接在 Claude Code 对话窗口输出统计数据。

**用法：**
```
/local-usage:query           → 今天的用量
/local-usage:query today     → 今天的用量（同上）
/local-usage:query yesterday → 昨天的用量
/local-usage:query 7d        → 最近 7 天合计
/local-usage:query 30d       → 最近 30 天合计
```

**输出示例：**
```
AI Usage · 2026-06-23
────────────────────────────────────────────
Source        Tokens        Cost
────────────────────────────────────────────
Claude Code   35.33M        $20.2269
Codex CLI     6.22M         $18.6711
────────────────────────────────────────────
Total         41.56M        $38.8981
```

---

### `/local-usage:init` — 一键安装看板服务

**首次安装时使用**，自动完成以下操作：
1. 检查 Node.js 版本
2. 询问安装目录（默认 `~/local-usage`）
3. 自动 clone 代码、安装依赖、构建项目
4. 询问服务启动方式（三选一）：

   | 选项 | 说明 | 推荐场景 |
   |------|------|---------|
   | **全局安装 PM2**（推荐） | 关闭终端后服务持续运行，崩溃自动重启，可设开机自启 | 长期使用 |
   | **项目级安装 PM2** | 功能同上，但 PM2 只装在项目目录内，不影响全局环境 | 不想污染全局 |
   | **不安装 PM2** | 直接 `npm start` 启动，零额外依赖 | 临时查看 |

完成后访问 `http://localhost:3002/dashboard` 查看看板。

> 如果已经安装过，再次运行会自动拉取最新代码并重启服务。

---

### `/local-usage:update` — 体检并修复现有安装

**当看板已经装过、但出问题时使用**（不会重新 clone）。常见场景：升级插件后新命令
定位不到安装目录（尤其把看板装在了自定义目录）、配置文件缺字段、依赖/构建过期、
服务注册丢失。它会逐项体检、修复，并**一直修到服务真正跑起来**（端口在监听）为止。

会做的事：
1. 定位并校验安装目录（必须是 `git clone` 下来的看板；不是就让你去 `/local-usage:init`）
2. 检查 Node ≥18
3. `git pull` 拉取最新代码
4. 体检配置：缺 `local-usage.config.json` 就重建；已存在则按最新模板补齐缺失的字段
   （运行方式 `runMode` 若没记录会问你一次并写入配置）
5. 按需 `npm install` / `npm run build`
6. 按配置里的运行方式把服务拉起/重启，验证端口在监听——起不来就看日志继续修

> **老用户升级后如果 `/local-usage:start` 找不到安装（尤其自定义安装目录），跑一次
> `/local-usage:update` 即可**——它只把现有安装重新登记并修复，不会重装。

---

### `/local-usage:start` — 启动看板服务

```
/local-usage:start
```

启动已安装的看板服务。服务启动后访问 `http://localhost:3002/dashboard`。

---

### `/local-usage:stop` — 停止看板服务

```
/local-usage:stop
```

停止后台运行的看板服务（不会删除数据）。

---

### `/local-usage:status` — 查看运行状态

```
/local-usage:status
```

检查看板服务是否正在运行，输出示例：

- 运行中：`✓ AI Usage Dashboard is running at http://localhost:3002/dashboard`
- 已停止：`✗ Dashboard is stopped. Use /local-usage:start to start it.`
- 未安装：`✗ No local-usage process found. Run /local-usage:init to install.`

---

### `/local-usage:open` — 在浏览器中打开看板

```
/local-usage:open
```

自动在默认浏览器中打开 `http://localhost:3002/dashboard`。

看板功能包括：
- 今日 / 昨日 / 近 7 天 / 近 30 天 / 近 90 天 用量切换
- 每日 Token 和费用明细列表
- 模型用量排行（支持按 Claude Code / Codex 分类）
- 历史趋势折线图

---

## 常见问题

**Q：`/local-usage:query` 显示 Codex CLI 为 0，但我明明用了 Codex？**

确认 `~/.codex/sessions/` 目录存在且有 `.jsonl` 文件。如果目录不存在，说明 Codex CLI 可能把数据存在了其他位置。

**Q：`/local-usage:status` 显示未运行，但我能访问 localhost:3002？**

你可能是用 `npm run dev` 手动启动的，而不是通过 PM2。`status` 命令只检测 PM2 进程。可以直接用 `/local-usage:open` 打开看板。

**Q：安装后看板访问不了？**

运行 `/local-usage:status` 查看状态，如果未运行执行 `/local-usage:start`。如果 `start` 也起不来或报错，运行 `/local-usage:update`——它会体检并修复（配置缺失、依赖/构建过期、服务未注册等），一直修到服务跑起来。

**Q：如何更新到最新版本？**

```
/plugin update local-usage
```

> 升级插件后，如果新命令定位不到你的安装（尤其装在自定义目录），运行一次 `/local-usage:update` 即可重新登记并修复，无需重装。

---

## 数据来源说明

| 数据源 | 文件路径 | 说明 |
|--------|---------|------|
| Claude Code | `~/.claude/projects/**/*.jsonl` | 每次对话的 Token 用量记录 |
| Codex CLI | `~/.codex/sessions/**/*.jsonl` | 每次会话的 Token 累计事件 |

所有数据均在本机读取，不经过任何网络请求。

---

## 相关链接

- 看板源码：[yuhin-chiu/local-token-usage](https://github.com/yuhin-chiu/local-token-usage)
- 插件源码：[yuhin-chiu/local-token-usage-plugin](https://github.com/yuhin-chiu/local-token-usage-plugin)
