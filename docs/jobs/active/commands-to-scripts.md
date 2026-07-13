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
| M2 | 只读检测类 `open` + `status` 进脚本；更新 `hooks/allow.js` 白名单；4 状态回归 | ✅ |
| M3 | 启停类 `start` + `stop` → `scripts/service.js`（改盘，不进白名单）；3 运行模式回归 | ✅ |
| M4 | `init` + `update` 的**机械部分** → `scripts/install.js`；`AskUserQuestion` 与诊断重试循环留 command；2 主路径回归 | ✅ |

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

- **当前进度**：M0+M1 完成并已提交（commit `11d38db`）。M1 产物：`scripts/usage.js`
  （text 默认 + `--format=json`）、`query.md` 变薄、`hooks/allow.js` 加 usage.js 白名单；
  冻结快照回归 today/7d/30d 逐字节一致（PASS）。
- **[M2 ①② 已定]** ① `open-browser.js` **进白名单**（`/open` 用户主动敲、无害 side-effect，不再弹框）；
  ② 回归**简化**——不再做 M1 那种硬核冻结快照对拍；`open-browser` 靠 `--dry-run` 验平台选择 +
  Windows 真开一次目视确认，`status.js` 到时在真实状态跑 + 逻辑评审即可。
- **[M2 open 完成]** commit `f73b448`：`scripts/open-browser.js`（`--port`/`--path`/`--dry-run`，
  输出 `URL/OPENER/OPENED`）、`open.md` Step 1 变一行、`hooks/allow.js` 加 open-browser.js 白名单。
  回归：dry-run 平台选择 ✅、缺 port 退出码 2 ✅、Windows 真开 ✅。
- **[M2 status 完成]** `scripts/status.js`（`--port --install-dir` → `PORT_LISTENING`(Node `net`
  试连 127.0.0.1，零 spawn) / `PM2_MODE`(global/npx/none，一次 `pm2 jlist` 回落 `npx pm2 jlist`) /
  `PM2_STATE`(online/stopped/absent，解析 jlist)）、`status.md` Step 1/2 改调脚本、`allow.js` 加
  status.js 白名单。回归：端口 yes/no 用临时监听切换 ✅、`no/global/absent` 真实态 ✅、缺参退出码 2 ✅；
  `online/stopped` 用**自清理占位进程**实测（pm2 start 同名 dummy → online → stop → stopped →
  delete → 恢复 absent，不碰真实 install）✅✅✅。四态全通过。Mac 实测列遗留。
  status.js 代码已提交（commit `4935273`）；本条 online/stopped 实测为验证补记，无代码改动。
- **[M3 完成]** `scripts/service.js`（`--action=start|stop --install-dir --port [--mode] [--dry-run]`）：
  自动探测三模式（global pm2 → npx pm2 → none）、按模式起/停、起后轮询端口返回
  `PORT_LISTENING/PM2_STATE/RESULT`。no-PM2 用 Node `spawn(detached).unref()` 统一三平台（替代
  nohup/Start-Process）；kill-by-port 按 `process.platform` 分支（lsof / powershell Stop-Process），
  平台差异收敛脚本内。`start.md`/`stop.md` 三模式+三平台块 → 各一行调 service.js（start 顺带复用
  open-browser.js）；诊断/`STATUS` gate/`/update`·`/init` 建议留 command。**service.js 改盘、不进白名单**。
  - **回归**：dry-run 验三模式/三平台命令选择 ✅；**真实全局 pm2 起停端到端**（用真实 install
    `D:/code3/local-usage`：start→yes/online/ok、stop→no/stopped/ok、清理恢复 absent）✅。
    npx/no-PM2/kill-by-port 本机 config=pm2-global 用不到，dry-run + 评审；Mac 遗留。
  - **回归抓到并修的 bug**：`waitForPort()` 原返回「是否达标」被误当「端口是否在监听」——start 凑巧对、
    stop 反了（停成功却报 fail）。改为返回**实际 listening 状态**，重测 stop 通过。
- **[已澄清·非 bug]** 之前误判"本机 marker 没写"——实为**bash 里没注入 `$CLAUDE_PLUGIN_DATA`** 的假象。
  真实 marker 一直在 `~/.claude/plugins/data/local-usage-ai-usage/install-path`（= `D:\code3\local-usage`，
  Jul 1 就写好）；真实插件运行有 env、定位正常。根因是**插件曾 `ai-usage`→`local-usage` 重命名**，老用户
  注册 slug 仍是 `ai-usage`，而 `resolve.js`/`install.js` 的 fallback **硬编码** `local-usage-local-usage`，
  env 缺失时对不上。**已修**：fallback 改为**扫描 `~/.claude/plugins/data/local-usage-*`**，兼容
  ai-usage/local-usage/未来任意 slug（反转 1.4.2 的"不兼容旧 slug"决策——理由：老用户真实存在，即本机）。
- **[M4 决策已定]** ① install.js 细子命令拆法 OK；② 全新 clone 回归用 dry-run+评审（不真下载），
  clone 子命令要「目标已是有效 install → 跳过」判断，只验此分支；用户晚点删项目自己 init 验全新 clone；
  ③ M4 分**两个 commit**：M4-1 marker+config（并修 marker），M4-2 clone/pull/build。
  微调：`detect-sources` 只读，按契约 D1 拆成独立只读脚本 `detect-sources.js`（进白名单），不进改盘的 install.js。
- **[M4-1 完成·未提交→即将 commit1]** `scripts/install.js`（改盘，**不进白名单**）子命令
  `write-marker`/`write-config`(upsert)/`sync-config`(diff `local-usage.config.example.json` 补缺键) +
  `scripts/detect-sources.js`（只读，进白名单）。init.md/update.md 的 marker/detect/写config/补键/runMode
  段全部变薄调脚本；clone/build/起服务段**仍是旧双写，留 M4-2**。
  - **marker 问题已修**：`install.js write-marker --install-dir=D:/code3/local-usage` → resolve.js 从
    `NONE`(错默认路径) 变 `FOUND/canonical/D:/code3/local-usage`。本机所有命令现在定位正确。
  - **回归**：detect-sources 真跑 ✅；write-config 新建/upsert（无 BOM、trailing NL、保留未传键）✅；
    sync-config 补缺键/`no-config` ✅；参数校验退出码 2 ✅；白名单放行 detect-sources、拦 install.js ✅。
- **下一步 M4-2（commit2）**：install.js 加 `clone`/`pull`/`build` 子命令；clone 先判目标是否已有效
  install（是则 `SKIPPED=exists` 不重下）；network-optional pull（fetch→仅落后 ff-only→`PULLED`）；
  build 按需（PULLED 或产物缺失）。init.md S3/S4、update.md S3/S5 变薄。起服务复用 service.js（已有）。
  回归：pull/build 在真实 `D:/code3/local-usage` 真跑；clone 的 skip 分支验（已存在→skip）；全新 clone
  dry-run+评审（用户自行删后 init 验）。Mac 遗留。
- **[M4-2 完成]** install.js 加 `clone`（已存在→`CLONED=skipped-exists` 不重下）/`pull`（network-optional，
  fetch→仅落后 ff-only→`PULLED`，offline/diverged 不阻塞）/`build`（node_modules+.next 在则 skip，`--force`
  覆盖，失败末 30 行→stderr + exit 1）。init.md S3/S4/S7/S8、update.md S3/S5/S6/S7 全部变薄——**六个命令
  已无任何 bash/PowerShell 双写**；起服务复用 service.js、打开复用 open-browser.js；pm2 安装/save/startup
  （含 sudo 手动提示）+ 诊断重试循环留 command。
  - **回归**：clone skip-exists ✅、pull up-to-date/`--no-pull` ✅、build skipped(产物在) ✅、参数退出码 2 ✅；
    全新 clone 真下载 + `build --force` 真编译按约定不跑（用户删项目自行 /init 验），逻辑评审。Mac 遗留。
- **[整个任务完成]** M0–M4 全绿。六命令（init/update/start/stop/status/open/query）确定性逻辑已下沉
  `scripts/`，命令 markdown 只做编排 + AskUserQuestion + 诊断重试。跨平台单一 Node 实现，无双写。
  只读脚本（resolve/usage/status/detect-sources/open-browser）进白名单；改盘脚本（service/install）不进。
  **遗留**：Mac 实测（本轮靠跨平台写法 + 评审）；全新 clone/build 真跑（用户自验）；Codex 适配（第二步整块）。
- **换机续接提示**：任务已完成，待归档到 `archive/`。真实 install 在 `D:/code3/local-usage`。

## M2 规划（已设计，待用户定 ①② 后执行）

**抽取目标**：
- `scripts/open-browser.js`：按 `process.platform` 选 `open`/`xdg-open`/`start`，替代
  `open.md` Step 1 的三平台块；支持 `--dry-run` 只打印将执行的命令（备回归）。
- `scripts/status.js`：入参 `--port --install-dir`，输出 `KEY=VALUE`：
  - `PORT_LISTENING=yes|no` —— 用 Node `net` 试连，**跨平台零 spawn**，替代 lsof / Get-NetTCPConnection 双写。
  - `PM2_MODE=global|npx|none`、`PM2_STATE=online|stopped|absent` —— 只读 `pm2 list` 探测。
- `commands/open.md`：Step 1 三平台块 → 一行 `node "${CLAUDE_PLUGIN_ROOT}/scripts/open-browser.js" --port=<PORT>`。
- `commands/status.md`：Step 1/2 → 调 `status.js` 读 KEY；agent 只做 `INSTALL_OK/MISSING`
  判断 + 文案组织（判断/措辞按铁律留 command 层）。
- `hooks/allow.js`：加 `status.js`（只读）白名单；`open-browser.js` 见 ①。

**待用户拍板**：
- **① `open-browser.js` 是否进白名单** —— 它打开浏览器（无害 side-effect，非纯只读）。
  现状 `/open` 那步本就弹框（open/Start-Process 不在白名单）。**默认建议：进**（`/open`
  不再弹框，用户主动敲即是要开）；备选：维持弹框、只放 `status.js`。
- **② 回归策略** —— M2 无法纯数据对拍。拟：`open-browser` 用 `--dry-run` 验平台选择
  正确 + Windows 真开一次人工确认；`status.js` 在真实状态跑、对齐旧 `status.md` 手动判断，
  4 状态（running/stopped/装了没起/没装）能造则造、其余靠逻辑评审；Mac 实测列遗留。

**边界（已定）**：pm2 **只读检测** M2 做进 `status.js`；pm2 **起停**（改盘）留 M3 的
`service.js`，M3 复用 M2 的探测逻辑，不提前把起停拉进 M2。
