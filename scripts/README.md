# scripts/ — 脚本契约（M0）

本目录是命令的**逻辑层**。命令 markdown 只做编排；确定性逻辑一律下沉到这里的 Node 脚本。
所有脚本必须遵守以下契约——这是跨平台（Windows / macOS / Linux）与跨 harness
（Claude Code / 将来 Codex）复用的地基。

## 1. 语言统一 Node

- 逻辑、控制流、路径处理、判断分支全部用 Node，靠 `os`/`path`/`child_process` 跨平台。
- **不写** bash + PowerShell 双套；不引入 Python（Node 是保证依赖，Python 不是）。
- 底层仍可 `spawn`/`execFile` 外部工具（`pm2`/`git`/`npx`），但由 Node 统一编排，
  平台差异收敛在脚本内一处。

## 2. 非交互、参数化、纯 IO（铁律）

- 脚本**永不**向用户提问、永不读交互式 stdin。要问人的（数据源/端口/运行模式）由
  command 层用 `AskUserQuestion` 问完，把答案当**参数**传进来。
- 需要临场判断 / 智能重试的（如「诊断→修复→重试直到端口 listening」）留在 command 层，
  脚本只做确定性动作。
- 输入只来自：命令行参数、环境变量。输出只去往：stdout（数据）、stderr（诊断）、退出码。

## 3. 输出协议

- **默认 `KEY=VALUE`**，每行一对，沿用 `resolve.js` 风格，便于命令读取/替换：
  ```
  STATUS=FOUND
  INSTALL_DIR=/Users/x/local-usage
  PORT=3002
  ```
- **给人看的终端展示**默认输出格式化文本（如 `usage.js` 的用量表格，命令层只透传、不解析），
  这样命令保持最薄、行为可逐字节回归。
- **供程序 / 看板消费的结构化数据用 JSON**（如 `usage.js --format=json`），单个 JSON 对象打到 stdout。
- 诊断信息走 stderr，不污染 stdout 的机器可读输出。

## 4. 退出码

- `0` 成功。
- 非 `0` 表示失败；用不同码区分可恢复/不可恢复（各脚本在头部注释里声明自己的码表）。
- 失败时人类可读原因写 stderr。

## 5. harness 特有路径当入参（D3）

- 脚本**不硬编码** harness 专有位置（如 `$CLAUDE_PLUGIN_DATA`、marker 存储目录）。
- 由适配层喂进来：优先读命令行参数 / 约定的环境变量，缺省再退到跨平台默认
  （如 `~/.<tool>/...`，用 `os.homedir()`）。
- Claude 侧传 `$CLAUDE_PLUGIN_DATA`；将来 Codex 侧传它自己的目录——脚本零改动。

## 6. 只读 vs 改盘分文件（D1）

- **只读脚本**（定位/检测：`resolve.js`、`usage.js`）：不碰磁盘状态，可进 `hooks/allow.js`
  白名单，一次放行、不弹框。
- **改盘脚本**（`service.js` 起停 pm2、`install.js` clone/build/写 marker/git 拉取）：
  会改变系统状态，**不进**白名单，照常走确认提示。
- 一个脚本只归一类；只读与改盘逻辑不混在同一文件。

## 7. 现有/规划中的脚本

| 脚本 | 类别 | 职责 | 状态 |
|------|------|------|------|
| `resolve.js` | 只读 | 定位安装目录 / 端口 / 有效性 / Node 版本，`KEY=VALUE` 输出 | 已有 |
| `usage.js` | 只读 | 走 `~/.claude` + `~/.codex` 会话算 token/成本；text 默认、`--format=json` 可选 | ✅ M1 |
| `service.js` | 改盘 | pm2 模式探测 + 起/停（三模式）+ 端口轮询校验；`--dry-run` | ✅ M3 |
| `install.js` | 改盘 | 写 marker / config upsert / config top-up（M4-1 ✅）；clone·pull·build（M4-2 待） | 🚧 M4 |
| `detect-sources.js` | 只读 | 检测 `~/.claude`·`~/.codex` 存在性，给 init/update 选源默认 | ✅ M4-1 |
