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
| `install.js` | 改盘 | marker / config upsert / config top-up / clone / pull / sync-code（版本锁定）/ build | ✅ M4 |
| `detect-sources.js` | 只读 | 检测 `~/.claude`·`~/.codex` 存在性，给 init/update 选源默认 | ✅ M4-1 |
| `release.sh` | 改盘 | 发布侧：把插件版本钉成看板同名 tag（见下） | ✅ |

## 8. 版本锁定与发布（version-lockstep）

看板代码「该不该更新」由**插件版本**说了算，而非看板 `main` 是否有新 commit——
根治插件没升级、看板却被反复 pull 的问题。

- **安装侧**：`install.js --action=sync-code` 读 `.claude-plugin/plugin.json` 的
  `version` → 目标 tag `v<version>`。看板 HEAD 已在该 tag 指向的 commit → `CODE_STATE=current`，
  零网络零构建；否则 checkout 到该 tag（`updated`）。脏工作区 / 本地提交 → `protected`
  只警告不动。tag 未发布 → `fallback` 回退跟 `main`（兼容无 tag 的看板 repo）。
  `init.md` / `update.md` 的 Step 3 都调它，rebuild 按 `CODE_CHANGED` 决定。

- **发布侧**：`release.sh` 把当前插件版本钉成看板同名 tag。**发版时**（不是每次 commit）跑：

  ```bash
  # 前提：插件和看板都已 commit 且 push 到各自 origin
  ./scripts/release.sh          # dry-run：显示将给看板哪个 commit 打什么 tag
  ./scripts/release.sh --push   # 确认后真正打 annotated tag 并推到看板 origin
  ```

  四道安全门：插件在 main+干净+与 origin 同步；看板同样；tag 已存在（本地或远程）
  则拒绝覆盖；默认 dry-run，`--push` 才动手且 push 后复核远程。看板 clone 默认探测
  `../local-usage`，可用 `--dashboard=<path>` 覆盖。

  > tag 钉的是某个确定 commit：之后看板 `main` 继续走，该插件版本用户也不会跟，
  > 要等插件升到下一版并再次 `release.sh --push`。这正是 lockstep 的目的——
  > 确保钉的是想让该版本用户跑的 commit。

