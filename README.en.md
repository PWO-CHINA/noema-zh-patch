# noema-zh-patch — Chinese UI for Noema

> Simplified Chinese UI for the Noema desktop app. This repository is its **development origin**: the dictionary and translator are maintained here and flow back upstream.
> Since Noema `ead7cbf` (plugin system), the Chinese UI ships as the official built-in plugin **noema.zh-cn** — most users don't need this repo at all; just enable the plugin inside Noema (see "Usage").

[中文 README](README.md)（默认）

---

## What this is

[Noema](https://github.com/AaronHnoraA/Noema) is a Typora-style Markdown editor (web / Electron desktop) that originally shipped English-only. This project translates the desktop UI — menus, panels, buttons, tooltips, status messages, 900+ strings. It has been upstreamed as a plugin (migrated from this repo's `8ff36eb`); this repo remains the development origin for the dictionary and translator.

Three defining properties:

- **Upstreamed**: upstream `plugins/noema-zh-cn/` mirrors this repo's `plugin/` directory; `node diff-upstream.mjs` reports every difference in one command.
- **Maintainable**: the dictionary is decoupled from the source. After an upstream update, `node harvest.mjs` lists exactly what's new and untranslated.
- **Safe by construction**: your notes are never touched (the `.cm-content` subtree is hard-pruned); every translation falls back to English.

---

## Part 1 · Usage

### Option A: official built-in plugin (recommended, Noema ≥ ead7cbf)

Nothing to download. In Noema, open **Configuration → Plugins → enable "Noema 简体中文"**, then restart Noema. Enablement is stored in `plugins.json` under the user-data directory.

> Only older Noema builds (pre-plugin-system) need option B.

### Option B: standalone patch wrapper (older Noema)

Requirements: Node `26.5.0`, npm `11.17.0`, and `npm ci` + `npm run build:aaronnote` completed inside the Noema repo.

### Install (three steps)

```bash
# 1. Clone Noema and this patch as sibling directories
git clone https://github.com/AaronHnoraA/Noema.git
git clone https://github.com/PWO-CHINA/noema-zh-patch.git

# 2. Build Noema's frontend (skip if already done)
cd Noema && npm ci && npm run build:aaronnote && cd ..

# 3. Run the installer (checks the environment and prints your launch command)
node noema-zh-patch/install.mjs
```

> Noema lives somewhere else? Set `NOEMA_REPO=/path/to/Noema`, or run `node install.mjs --noema /path/to/Noema`.

### Launch

Start Electron with the patch's `zh-main.mjs` as the entry instead of Noema's original one:

```bash
# Windows
Noema/node_modules/electron/dist/electron.exe noema-zh-patch/zh-main.mjs

# macOS
Noema/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron noema-zh-patch/zh-main.mjs

# Linux
Noema/node_modules/electron/dist/electron noema-zh-patch/zh-main.mjs
```

Save this as a shortcut or shell alias for daily use.

### Disable and uninstall

| Goal | How |
| --- | --- |
| See the English UI once | Launch with `NOEMA_ZH=0` — byte-for-byte the unpatched behavior |
| Uninstall for good | Launch via Noema's original `desktop/main.mjs` entry; delete this repo. Nothing on the Noema side needs cleanup |

### Translation coverage

| Translated | Deliberately not translated |
| --- | --- |
| App menu bar and context menus (including system items like Cut/Copy/Select All) | **Your notes** — the editor document surface is hard-excluded |
| Title-bar buttons and tooltips | Brand names (Noema, Jupyter, Wiki, LaTeX, KaTeX, VS Code) |
| Tools list, graph/task/Jupyter panels | Native file-dialog buttons (rendered by the OS) |
| Configuration page, Wiki workbench | Graph canvas interiors (drawn on `<canvas>`, outside the DOM) |
| Status-bar messages (including interpolated ones) | The Vite browser dev preview (a development path, not daily use) |
| File-dialog titles and file-type filters | |

---

## Part 2 · Maintenance

For users who want to keep the translation current and accurate.

### After a Noema upgrade

```bash
cd Noema && git pull && npm ci && npm run build:aaronnote && cd ..
node noema-zh-patch/install.mjs   # refresh the dictionary's baseline commit
node noema-zh-patch/harvest.mjs   # reconcile the dictionary against upstream source
```

`harvest.mjs` reports three things:

1. **New untranslated strings** — UI copy added upstream; add them to the dictionary.
2. **Candidate stale entries** — dictionary keys that may have disappeared upstream (review before deleting).
3. **Commit drift** — whether the dictionary baseline matches the repo HEAD.

### Adding a translation

Everything lives in `plugin/zh-CN.json`, two kinds of entries:

```jsonc
{
  "exact": {
    // Fixed copy: the English key must match the source byte-for-byte (including … and punctuation)
    "Save note first": "请先保存笔记"
  },
  "regex": [
    // Interpolated copy: capture the variable, backfill with $1
    { "pattern": "^Running (\\d+) Jupyter cells?…$", "replace": "正在运行 $1 个 Jupyter 单元…" }
  ]
}
```

### Flowing updates back upstream (official plugin sync)

This repo's `plugin/` mirrors upstream `Noema/plugins/noema-zh-cn/` one-to-one:

```bash
node diff-upstream.mjs   # diff plugin/ against the upstream plugin directory
```

It reports per-file identity (plugin.json / main.mjs / renderer.js / README.md) plus entry-level dictionary deltas (added / changed / missing). When the reported delta is what you intend to ship, copy `plugin/` over `plugins/noema-zh-cn/` in a Noema checkout and open the PR — that is the "future updates land directly in main" path.

### Finding what's still untranslated

```bash
NOEMA_ZH_DEBUG=1 Noema/node_modules/electron/dist/electron.exe noema-zh-patch/zh-main.mjs
```

Use the app normally; every missed UI string is deduplicated into `misses.log`. The per-launch self-check (menu-hook interception count, translation hit rate) is recorded in `runtime.log`. You can also run `collect-en.mjs` to dump every untranslated string on any page (see Repository layout).

---

## Part 3 · Development

For developers who want to understand the mechanics, extend the patch, or help upstream it.

### Architecture

The patch swaps Electron's entry point from `desktop/main.mjs` to the wrapper `zh-main.mjs`. The wrapper registers three translation channels, then `await import()`s the original entry — whose `import.meta.url` is unchanged, so all of its internal path resolution keeps working. The "zero-touch" property comes from patching **inside the process** rather than **on disk**.

### The three channels

1. **Menu channel (main process)**: monkey-patches `Menu.buildFromTemplate` to recursively translate template `label`s. Pure `{ role }` items (Cut, Copy, …) receive an explicit Chinese label at template time; role semantics are untouched. One hook covers the app menu, context menus, and any future dynamic menus. `dialog.showOpenDialog` is wrapped for dialog titles and file filters.
2. **Page channel (renderer)**: intercepts the local host's HTML document responses via `session.protocol.handle` and injects a bootstrap at the very top of `<head>` — cloak style (hides `body` via `opacity`, with a pure-CSS 1.5 s fail-open animation so the page reverts to visible English even if all JS dies) → pending flag → translator script. The translator runs during HTML parsing and **installs its MutationObserver immediately** (not at DOMContentLoaded); observer callbacks are microtasks that run before paint, and translation happens **synchronously inside the callback** (childList processes `addedNodes` only), so the first UI renders directly in Chinese. An explicit stack walk **prunes `.cm-content` at the element level** (the subtree is never entered, so typing in large documents stays cheap). The `dom-ready` `executeJavaScript` injection remains as a fallback, with a DOM-level idempotency marker (`data-zh-patched`) preventing double execution. Known limits: DOM created before the observer installs, and text inside iframe/Shadow DOM/canvas, are out of scope.
3. **Interpolation channel**: regex entries in the dictionary handle runtime-composed strings like `Running ${n} cells`.

### Safety design

- **Document isolation**: both the TreeWalker and the MutationObserver explicitly skip the `.cm-content` subtree, so note content can never be translated (verified programmatically).
- **English fallback**: unmatched strings render as-is; every patch point is wrapped in try/catch and returns the original on error.
- **One-switch bypass**: with `NOEMA_ZH=0` the wrapper does nothing but load the original entry.
- **CSP outlook**: the page channel relies on inline `<script>`. If upstream ever ships a strict CSP (no `unsafe-inline`), that channel stops working but the cloak still fails open to English; the migration path is session preload or CDP injection (both already evaluated).
- **Self-check**: every launch logs the menu-hook interception count and hit rate to `runtime.log`. If an upstream refactor breaks the hook, the log says so loudly instead of failing silently.

### Why not a source-level locale layer?

Introducing `t()` into the source is the "proper" i18n approach, but it touches hundreds of call sites in an actively developed repo — every `git pull` becomes a merge. This patch deliberately concentrates all complexity into one standalone dictionary file in exchange for total decoupling from upstream. If Noema ever adopts built-in localization, this dictionary (~810 exact entries, ~170 interpolation patterns, one terminology glossary) can migrate directly as the first language pack.

### Repository layout

| File | Role |
| --- | --- |
| `plugin/` | **Mirror of upstream `Noema/plugins/noema-zh-cn/`** (single source of truth) |
| `plugin/zh-CN.json` | The dictionary: `exact` matches / `roles` menu-role labels / `regex` interpolation patterns; `meta.syncedCommit` records the baseline commit |
| `plugin/renderer.js` | Renderer translator (line-identical to the upstream plugin) |
| `plugin/main.mjs` | Thin adapter over the official plugin-host API (line-identical to upstream) |
| `plugin/plugin.json` | Plugin manifest (id `noema.zh-cn`) |
| `zh-main.mjs` | Standalone wrapper (Electron entry for older Noema; also reads dictionary/renderer from `plugin/`) |
| `install.mjs` | Setup guidance: environment check, baseline refresh, launch-command generation |
| `harvest.mjs` | Drift reconciliation: new untranslated / candidate stale / commit comparison |
| `diff-upstream.mjs` | **Alignment check: `plugin/` vs upstream plugin directory, PR-ready delta report** |
| `collect-en.mjs` | Residual-English scanner (hidden window; dumps untranslated strings per page) |
| `verify-renderer.mjs` | Automated renderer verification (hidden-window injection diff) |
| `verify-inject.mjs` | Protocol-injection verification (sandboxed window is Chinese at dom-ready; flash regression test) |

### Quality baseline

Verified against Noema `ead7cbf`: menu label hit rate 92/92; official plugin activation log `dictionary loaded (exact=917, regex=182)`; Wiki/config/main scans show only brand names, icon glyphs, data values, and shortcut hints; zero Chinese characters inside `.cm-content`.

### Contributing

- **Fix a translation**: PR against `plugin/zh-CN.json`. English keys must match source byte-for-byte; follow the established terminology (note→笔记, graph→图谱, agenda→日程, snippet→代码片段, cell→单元).
- **Track upstream**: run `node harvest.mjs` and PR the new entries together with the updated `meta.syncedCommit`; check the delta with `node diff-upstream.mjs` before opening the upstream PR.
- **Report a bug**: attach `runtime.log`; for missing translations, attach `misses.log` from a `NOEMA_ZH_DEBUG=1` run.

## License

[AGPL-3.0-only](LICENSE), same as Noema — anything here can flow upstream without friction.
