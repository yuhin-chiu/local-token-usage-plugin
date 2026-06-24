# Changelog

All notable changes to `ai-usage` plugin are documented here.

---

## [1.0.5] - 2026-06-24

### Changed
- `/ai-usage:start` now automatically opens the dashboard in the default browser after the service starts successfully

---

## [1.0.4] - 2026-06-23

### Changed
- `/ai-usage:init` now offers three PM2 installation modes:
  1. Global PM2 install (recommended)
  2. Project-level PM2 install
  3. No PM2 (direct `npm start`)
- `/ai-usage:start`, `/ai-usage:stop`, `/ai-usage:status` updated to handle all three modes

---

## [1.0.3] - 2026-06-23

### Added
- `/ai-usage:query` now accepts date range arguments: `today` (default), `yesterday`, `7d`, `30d`

---

## [1.0.2] - 2026-06-23

### Fixed
- Codex CLI JSONL parsing: corrected event structure traversal
  - Type check: `obj.type === 'event_msg' && obj.payload?.type === 'token_count'`
  - Token value: `obj.payload.info.last_token_usage.total_tokens`

---

## [1.0.1] - 2026-06-23

### Added
- README: two-step installation instructions (`/plugin marketplace add` + `/plugin install`)

---

## [1.0.0] - 2026-06-23

### Added
- Initial release with 6 commands: `init`, `start`, `stop`, `status`, `open`, `query`
- Claude Code data source: reads `~/.claude/projects/**/*.jsonl`
- Codex CLI data source: reads `~/.codex/sessions/**/*.jsonl`
- Cost estimation using hardcoded pricing table per model
