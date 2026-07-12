# Backlog — 未开始任务

每条只记范围 + 验收，故意不细化；提升到 `active/<id>.md` 时再展开四件套。

---

## [version-lockstep] 插件版本 ↔ 看板 tag 锁定，治反复 pull

**背景**：当前 `/update` Step 3 只要 upstream `main` 有新 commit 就 ff-only 拉，
跟插件版本无关 → 插件没升级、看板照样被反复 pull。看板 repo 现状：0 个 tag，
`package.json` 停在 1.4.0（早跟插件 1.6.0 漂了）。

**目标**：用插件版本当「源码该不该更新」的开关——插件版本没升，源码零动作。

**方案 A（已选，推荐）**：看板发布即打同名 tag（插件 `1.6.0` ↔ 看板 `v1.6.0`）。
`/update` Step 3 改为：
1. 读 `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json` 的 `version` → 目标 `v<version>`。
2. 先离线判断本地 HEAD 是否已在该 tag → 是则整步跳过（不 fetch / 不 npm / 不 build）。
3. 否则 `git fetch --tags` → checkout `v<version>` → rebuild。
4. tag 未发（发布滞后）→ 警告并回退现有 ff-only 兜底。
- 可选：`resolve.js` 顺带输出 `DASH_REF`（当前 `git describe`/HEAD）用于展示。

**开发机护栏**：工作区脏 / 有本地提交时只警告不动（best-effort），普通用户永不触发；
`--no-pull` 可直接绕过。

**流程代价**：看板 repo 养成发布打 tag 的习惯（`git tag v1.6.0 && git push --tags`）。

**验收**：
- 插件版本不变时重复跑 `/update` → 零网络、零 rebuild、看板 HEAD 不动。
- 插件升级后跑 `/update` → 自动 checkout 到新版本 tag 并 rebuild。
- 两个目录版本确定性一致，跨机器可复现。

**影响范围**：`commands/update.md`（Step 3）、可能 `scripts/resolve.js`（加 `DASH_REF`）、
看板 repo 发布流程文档。

---

## [commands-to-scripts] 命令脚本化

**背景**：命令是 markdown（prompt 式），每个 shell 片段都由 Claude 当一次 Bash 调用
执行——步骤多、每步可能弹框、跨平台还要 bash + PowerShell 各写一套。`resolve.js`
已验证「把重复逻辑收敛成一个脚本」既能去重又能被 hook 白名单一次放行、少弹框。

**目标**：把几个 command 里的 shell 逻辑抽成脚本，命令只负责编排（调脚本 + 读输出 +
必要的 AskUserQuestion），减少弹框、去掉双平台重复块、逻辑集中好维护。

**待定（提升到 active 时定）**：
- 哪些命令优先脚本化（候选：`start` / `stop` / `status` / `open` 的启停/检测逻辑）。
- 脚本边界：纯定位/检测（只读，可 hook 放行）vs 会改盘的动作（pm2 起停、写 marker、
  git 拉取——这些要不要进脚本、进了如何对待白名单与提示）。
- 脚本语言统一 Node（已确立 Node 是保证依赖，Python 不是）。
- 输出协议沿用 `resolve.js` 的 `KEY=VALUE` 风格。

**验收**：目标命令的 shell 逻辑集中到 `scripts/`，命令 markdown 变薄；跨平台单一实现；
只读脚本走 hook 白名单不弹框；行为与现状一致（回归验证）。

**影响范围**：`scripts/`（新增若干）、`commands/*.md`、可能 `hooks/allow.js`（白名单）。
