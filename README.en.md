# noema-zh-patch — Chinese UI for Noema

> A complete Simplified Chinese interface for the Noema desktop app — without touching a single line of Noema's source code.
> `git pull` upstream whenever you like: this patch can never conflict, and its worst-case failure mode is simply an English UI again.

[中文 README](README.md)（默认）

---

## What this is

[Noema](https://github.com/AaronHnoraA/Noema) is a Typora-style Markdown editor (web / Electron desktop) that ships English-only. This patch translates the desktop UI — menus, panels, buttons, tooltips, status messages, ~900 strings — by **runtime injection** rather than source modification.

Three defining properties:

- **Zero-touch**: the patch is a standalone set of files outside the Noema repository. Nothing upstream is added, deleted, or modified.
- **Maintainable**: the dictionary is decoupled from the source. After an upstream update, one command tells you exactly which strings are new and untranslated.
- **Safe by construction**: your notes are never touched (the editor surface is hard-excluded), every translation falls back to English, and no failure path can affect your data.

---

## Part 1 · Usage

### Requirements

- Noema's development environment as documented upstream (Node `26.5.0`, npm `11.17.0`)
- `npm ci` and `npm run build:aaronnote` completed inside the Noema repo

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

Everything lives in `zh-CN.json`, two kinds of entries:

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

### Finding what's still untranslated

```bash
NOEMA_ZH_DEBUG=1 Noema/node_modules/electron/dist/electron.exe noema-zh-patch/zh-main.mjs
```

Use the app normally; every missed UI string is deduplicated into `misses.log`. The per-launch self-check (menu-hook interception count, translation hit rate) is recorded in `runtime.log`.

---

## Part 3 · Development

For developers who want to understand the mechanics, extend the patch, or help upstream it.

### Architecture

The patch swaps Electron's entry point from `desktop/main.mjs` to the wrapper `zh-main.mjs`. The wrapper registers three translation channels, then `await import()`s the original entry — whose `import.meta.url` is unchanged, so all of its internal path resolution keeps working. The "zero-touch" property comes from patching **inside the process** rather than **on disk**.

### The three channels

1. **Menu channel (main process)**: monkey-patches `Menu.buildFromTemplate` to recursively translate template `label`s. Pure `{ role }` items (Cut, Copy, …) receive an explicit Chinese label at template time; role semantics are untouched. One hook covers the app menu, context menus, and any future dynamic menus. `dialog.showOpenDialog` is wrapped for dialog titles and file filters.
2. **Page channel (renderer)**: at startup the translator is bundled as a session-level preload (`session.registerPreloadScript`), injected into every window before page scripts and before first paint, translating synchronously at `DOMContentLoaded` — **the UI appears in Chinese directly, with no English flash**. A TreeWalker pass translates text nodes and `title`/`placeholder`/`aria-label` attributes; a debounced (50 ms) MutationObserver handles dynamically added content. The `dom-ready` `executeJavaScript` injection remains as a fallback, and a DOM-level idempotency marker (`data-zh-patched`) keeps the two paths from double-running.
3. **Interpolation channel**: regex entries in the dictionary handle runtime-composed strings like `Running ${n} cells`.

### Safety design

- **Document isolation**: both the TreeWalker and the MutationObserver explicitly skip the `.cm-content` subtree, so note content can never be translated (verified programmatically).
- **English fallback**: unmatched strings render as-is; every patch point is wrapped in try/catch and returns the original on error.
- **One-switch bypass**: with `NOEMA_ZH=0` the wrapper does nothing but load the original entry.
- **Self-check**: every launch logs the menu-hook interception count and hit rate to `runtime.log`. If an upstream refactor breaks the hook, the log says so loudly instead of failing silently.

### Why not a source-level locale layer?

Introducing `t()` into the source is the "proper" i18n approach, but it touches hundreds of call sites in an actively developed repo — every `git pull` becomes a merge. This patch deliberately concentrates all complexity into one standalone dictionary file in exchange for total decoupling from upstream. If Noema ever adopts built-in localization, this dictionary (~810 exact entries, ~170 interpolation patterns, one terminology glossary) can migrate directly as the first language pack.

### Repository layout

| File | Role |
| --- | --- |
| `zh-CN.json` | The dictionary: `exact` matches / `roles` menu-role labels / `regex` interpolation patterns; `meta.syncedCommit` records the baseline commit |
| `zh-main.mjs` | Main-process wrapper (the actual Electron entry) |
| `zh-renderer.js` | Renderer translator (injected by the wrapper) |
| `install.mjs` | Setup guidance: environment check, baseline refresh, launch-command generation |
| `harvest.mjs` | Drift reconciliation: new untranslated / candidate stale / commit comparison |
| `verify-renderer.mjs` | Automated renderer verification (hidden-window injection diff) |
| `verify-preload.mjs` | Preload delivery verification (UI is Chinese at dom-ready; flash regression test) |

### Quality baseline

Verified against Noema `343edf5`: menu label hit rate 90/91 (the single miss is the brand name, kept on purpose); 110/125 visible UI strings on the main window translated (rest are brand names and icon glyphs); zero Chinese characters inside `.cm-content`.

### Contributing

- **Fix a translation**: PR against `zh-CN.json`. English keys must match source byte-for-byte; follow the established terminology (note→笔记, graph→图谱, agenda→日程, snippet→代码片段, cell→单元).
- **Track upstream**: run `node harvest.mjs` and PR the new entries together with the updated `meta.syncedCommit`.
- **Report a bug**: attach `runtime.log`; for missing translations, attach `misses.log` from a `NOEMA_ZH_DEBUG=1` run.

## License

[AGPL-3.0-only](LICENSE), same as Noema — anything here can flow upstream without friction.
