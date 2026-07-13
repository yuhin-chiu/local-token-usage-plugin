# [commands-to-scripts] 命令脚本化（Claude 侧）

> 进行中。跨会话续接：先读「续接锚点」，再看「决策日志」。

## 范围与目标

**分层目标**：
- 最终：Codex + CC 都能在 Windows + Mac 用。
- 第一步（本轮）：**只保证 CC 在 Windows + Mac 用**；不碰任何 Codex 适配。

把 6 个命令（`init`/`update`/`start`/`stop`/`status`/`open`/`query`）里的**确定性逻辑**
抽进 `scripts/`，统一用 Node 实现；命令 markdown 只做编排（调脚本 + 读输出 + 必要的
`AskUserQuestion`）。

**为什么**：现状命令是 prompt 式 markdown，每个 shell 片段一次 Bash 调用、可能弹框，
跨平台还要 bash + PowerShell 双写。收敛到 Node 脚本后：去重、跨平台单一实现、只读脚本
走 hook 白名单少弹框、逻辑集中好维护。

**更大背景**：本轮只做 Claude 侧。脚本层做成非交互/参数化后，将来 Codex（尤其 Mac）
可直接复用同一批脚本，只需换一层薄适配。见 [[跨平台铁律]]。

## 决策日志

- **[已定] 脚本语言统一 Node** — 跨平台关键。逻辑/控制流/路径/判断全在一套 Node 里
  （`os`/`path`/`child_process`），底层仍 spawn `pm2`/`git`/`npx`，但双平台分支收敛到
  Node，Mac/Win/Linux 一套代码。`resolve.js` 已验证此路。
- **[跨平台铁律] 脚本一律非交互、参数化、纯 IO** — 要问人 / 要临场判断的留在 command 层；
  harness 特有路径（如 `$CLAUDE_PLUGIN_DATA`）由适配层当入参/环境变量喂给脚本，脚本不硬编码。
  这是脚本层能被 Codex 复用的前提。
- **[D1 已定] 改盘动作也进脚本，但与只读逻辑分文件** — 只读（`resolve.js`/`usage.js`）→
  hook 白名单放行；改盘（`service.js`/`install.js`：pm2 起停、写 marker、git 拉取）→
  照常走确认提示，不进白名单。既集中逻辑又不误放行危险操作。
- **[D2 已定 + M1 细化] 输出协议沿用 `resolve.js` 的 `KEY=VALUE`** — 但**给人看的终端表格
  默认输出格式化文本**（命令层只透传、可逐字节回归），JSON 只作为 `--format=json` 供程序/
  看板消费。（曾误把 `usage.js` 定为纯 JSON，会破坏回归，已在 M1 修正。）
- **[M1 记录] 回归遇实时写入竞争的解法** — `~/.claude/projects` 被当前会话实时写入，today
  区间直接对拍会漂。解法：Node 内 `fs.cpSync` 冻结数据快照 + `USERPROFILE`/`HOME` 重定向子
  进程读快照，两边读同一份不变数据。M2/M3 涉及会话数据的回归沿用此法。
- **[D3 降级] `resolve.js` 的 data-dir 入参化——本轮不做，只「不挡路」** — 该改动对 CC
  跨平台无帮助（CC 在 Mac 仍用 `$CLAUDE_PLUGIN_DATA`），纯为 Codex 铺路。第一步不做 Codex，
  故降级：脚本写法保持路径靠 `os`/`path`、非交互，将来接 Codex 好接即可，**不进本轮目标与验收**。
- **[范围] 第一步 = CC ×（Windows+Mac），不含 Codex** — Codex 适配、data-dir 入参化等一律
  留第二步；本轮任何验收不涉及 Codex。
- **[Mac 验证] 暂无 Mac，靠写法保证** — 脚本用跨平台写法 + 逐行评审 Mac 兼容性；**Windows
  实测为硬门**，Mac 实测列为待补遗留项（见「遗留项」）。

## 里程碑

| M | 内容 | 状态 |
|---|------|------|
| M0 | 定脚本契约 → `scripts/README.md`（CLI 规范：非交互/参数/输出协议/退出码/data-dir 入参） | ✅ |
| M1 | 试点 `query` → `scripts/usage.js`；`query.md` 变薄；输出逐字节回归 | ✅ |
| M2 | 只读检测类 `open` + `status` 进脚本；更新 `hooks/allow.js` 白名单；4 状态回归 | 🔲 |
| M3 | 启停类 `start` + `stop` → `scripts/service.js`（改盘，不进白名单）；3 运行模式回归 | 🔲 |
| M4 | `init` + `update` 的**机械部分** → `scripts/install.js`；`AskUserQuestion` 与诊断重试循环留 command；2 主路径回归 | 🔲 |

顺序理由：先证明模式（M1 最独立、零 CC 依赖），再铺开；M4 最重、最易破坏交互，放最后。

## 验收（硬门）

- 每个 M 交付前，抽取前后行为**对拍一致**，不一致不合并。
- 目标命令 shell 逻辑集中到 `scripts/`，命令 markdown 变薄。
- 跨平台单一实现（无 bash/PowerShell 双写）；脚本只用 `os`/`path`/`child_process` 等跨平台 API。
- **Windows 实测通过**（本轮硬门）；**Mac 靠跨平台写法 + 逐行兼容性评审**，实测列为遗留项。
- 只读脚本走 hook 白名单不弹框；改盘脚本不进白名单。
- 开发机护栏保留：脏工作区 / 本地提交只警告不动。

## 遗留项（第一步不做，留第二步）

- **Mac 实测**：暂无 Mac 环境，本轮靠写法 + 评审保证；有 Mac 后按各 M 的验证清单实测补齐。
- **Codex 适配**：skills/prompts 层、data-dir 入参化、审批模型对接——整块留第二步。

## 影响范围

`scripts/`（新增 `README.md` + `usage.js`/`service.js`/`install.js` 等）、`commands/*.md`、
`hooks/allow.js`（白名单）、可能 `scripts/resolve.js`（D3 的 data-dir 入参）。

## 续接锚点

- **当前进度**：M1 完成 ✅。`scripts/usage.js`（text 默认 + `--format=json`）抽出，`query.md`
  变薄为「日期映射 + 调脚本」，`hooks/allow.js` 加了 usage.js 只读白名单；冻结快照回归
  today/7d/30d 三区间逐字节一致（PASS）。**未提交**。
- **下一步**：M2 —— `open` + `status` 的只读定位/检测逻辑进脚本，更新白名单；4 状态
  （running / stopped / 装了没起 / 没装）回归。
- **等待**：用户决定「先提交 M0+M1 再进 M2」还是「继续攒到一起提交」。
