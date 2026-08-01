# noema-zh-patch

[Noema](https://github.com/AaronHnoraA/Noema) 桌面端的中文（简体）界面补丁。
A Chinese (zh-CN) UI patch for the [Noema](https://github.com/AaronHnoraA/Noema) desktop app.

**零侵入**：不修改 Noema 仓库的任何文件，`git pull` 升级永不冲突。补丁失效的最坏情况是界面回到英文，不影响任何数据和功能。
**Zero-touch**: not a single file in the Noema repo is modified, so upstream pulls never conflict. Worst-case failure is simply an English UI again — your data and notes are never touched.

---

## 中文使用指南

### 翻译范围

- 应用菜单栏（含剪切/复制/全选等系统项）、右键菜单、文件对话框标题
- 标题栏按钮与悬停提示、Tools 列表、图谱/任务/Jupyter 面板、配置页、Wiki 工作台
- 状态栏提示（含带数字的动态文案）

### 故意不翻译

- **你的笔记内容**——编辑器文档区（`.cm-content`）被硬性跳过
- 品牌名：Noema、Jupyter、Wiki、LaTeX、KaTeX、VS Code
- 原生文件对话框按钮（由操作系统控制）、图谱画布内部（canvas 渲染）

### 安装

前提：已经按 Noema 官方说明装好开发环境（Node 26.5.0 + npm 11.17.0），并在 Noema 仓库里执行过 `npm ci` 和 `npm run build:aaronnote`。

```bash
# 把本仓库 clone 为 Noema 的兄弟目录（目录名必须是 Noema 的兄弟，或用 --noema 指定）
git clone https://github.com/AaronHnoraA/Noema.git
git clone https://github.com/PWO-CHINA/noema-zh-patch.git

cd noema-zh-patch
node install.mjs
```

`install.mjs` 会检查环境、刷新词典的 `syncedCommit`，并打印启动命令。

### 启动

```bash
# Windows
Noema/node_modules/electron/dist/electron.exe noema-zh-patch/zh-main.mjs

# macOS / Linux
Noema/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron noema-zh-patch/zh-main.mjs   # macOS
Noema/node_modules/electron/dist/electron noema-zh-patch/zh-main.mjs                                # Linux
```

如果 Noema 不在兄弟目录，设一个环境变量即可：`NOEMA_REPO=/path/to/Noema`。

### 关闭与卸载

- 临时关闭：`NOEMA_ZH=0` 启动，完全等同未打补丁。
- 彻底卸载：直接用 Noema 原始的 `desktop/main.mjs` 入口启动；删掉本仓库即可，Noema 那边没有任何需要清理的东西。

### Noema 升级之后

```bash
cd Noema && git pull && npm ci && npm run build:aaronnote
cd ../noema-zh-patch
node install.mjs   # 刷新 syncedCommit
node harvest.mjs   # 对账：新增未翻字符串 / 候选废弃条目 / commit 漂移
```

把 `harvest.mjs` 列出的新增英文字符串补进 `zh-CN.json` 就完成适配。

### 自己补一条翻译

编辑 `zh-CN.json`：

- 固定文案加到 `exact` 节：`"Save note first": "请先保存笔记"`（英文 key 必须与源码逐字符一致，含省略号 `…`）
- 带变量的文案加到 `regex` 节：`{"pattern": "^Running (\\d+) Jupyter cells?…$", "replace": "正在运行 $1 个 Jupyter 单元…"}`

想找还有哪些没翻：`NOEMA_ZH_DEBUG=1` 启动并正常操作一遍，未命中的字符串会收集到 `misses.log`。

### 文件说明

| 文件 | 作用 |
| --- | --- |
| `zh-CN.json` | 翻译词典（`exact` 精确匹配 / `roles` 菜单 role 文案 / `regex` 插值模板） |
| `zh-main.mjs` | 主进程包装器，Electron 实际入口 |
| `zh-renderer.js` | 页面内翻译器，由包装器注入每个窗口 |
| `install.mjs` | 环境检查与安装引导 |
| `harvest.mjs` | 升级后词典漂移检查 |
| `verify-renderer.mjs` | 渲染层验证脚本（隐藏窗口注入对比） |
| `runtime.log` | 每次启动的自检日志（gitignore） |
| `misses.log` | DEBUG 模式收集的未翻译字符串（gitignore） |

---

## English

### How it works

The Electron entry point is swapped — at launch time, not in the repo — from `desktop/main.mjs` to `zh-main.mjs`, a small main-process wrapper that registers three translation channels and then `await import()`s the original entry unchanged:

1. **Menus** — monkey-patches `Menu.buildFromTemplate` to recursively translate template labels. Pure `{ role }` items get an explicit Chinese label (role semantics untouched). `dialog.showOpenDialog` is wrapped for dialog titles and filter names. One hook covers the app menu, context menus, and any future dynamic menus.
2. **Page UI** — on `web-contents-created` → `dom-ready`, injects `zh-renderer.js` into every window via `webContents.executeJavaScript`. The renderer translator rewrites text nodes and `title`/`placeholder`/`aria-label` attributes (TreeWalker full pass + debounced MutationObserver for dynamic content).
3. **Interpolated strings** — regex entries in the dictionary (e.g. `/^Running (\d+) Jupyter cells?…$/`).

### Safety invariants

- The editor document (`.cm-content`) is never touched — verified programmatically.
- Untranslated strings fall back to English silently; every patch point is wrapped in try/catch.
- `NOEMA_ZH=0` disables the patch completely.
- The dictionary carries `meta.syncedCommit`; `harvest.mjs` reports upstream drift (new untranslated strings, stale entries, commit mismatch), and `zh-main.mjs` self-checks that its menu hook actually fired (interception counter + hit-rate log in `runtime.log`).

### Verified against

Noema commit `343edf5` (see `zh-CN.json` → `meta.syncedCommit`): menu label hit rate 90/91 (the one miss is the brand name "Noema", kept on purpose); 110/125 visible UI strings translated on the main window; zero Chinese characters inside `.cm-content`.

### A note to upstream

The durable value here is `zh-CN.json` (~810 curated entries + ~170 interpolation patterns, built with a fixed terminology glossary) plus the map of where user-facing strings live. The right long-term home is a proper locale layer in Noema itself — a minimal `t()` lookup with `zh-CN.json` as the first locale — after which this wrapper can retire. Until then, this repo serves as the maintenance vehicle: PRs with dictionary updates and new-locale tooling are welcome. See the issue tracker for the upstreaming discussion.

### Contributing

- **Dictionary fixes**: edit `zh-CN.json`, keep English keys byte-identical to source (including `…`), follow the existing terminology (note→笔记, graph→图谱, agenda→日程, snippet→代码片段, export→导出, workspace→工作区, cell→单元).
- **After upstream updates**: run `node harvest.mjs` and PR the new entries.
- **Bug reports**: include `runtime.log` and, with `NOEMA_ZH_DEBUG=1`, `misses.log`.

## License

AGPL-3.0-only, same as Noema, so anything here can be upstreamed without friction.
