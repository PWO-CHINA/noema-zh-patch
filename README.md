# noema-zh-patch — Noema 中文界面补丁

> 不修改 Noema 的任何源代码，为桌面端提供完整的简体中文界面。
> 升级 Noema 时 `git pull` 永远不会与本补丁冲突；补丁即使失效，最坏情况也只是界面回到英文。

[English README](README.en.md)

---

## 这是什么

[Noema](https://github.com/AaronHnoraA/Noema) 是一款 Typora 风格的 Markdown 编辑器（Web / Electron 桌面端），官方界面只有英文。本补丁通过**运行时注入**的方式，把桌面端的菜单、面板、按钮、提示等界面文本翻译成中文，覆盖约 900 条文案。

它的三个关键性质：

- **零侵入**：补丁是 Noema 仓库之外的一组独立文件，不增删改上游任何一行代码。
- **可维护**：词典与源码解耦。上游更新后运行一条命令即可对账，新增了哪些未翻译的字符串一目了然。
- **绝对安全**：编辑器里的笔记内容永不触碰；所有翻译逻辑都有英文兜底，任何异常都不会影响数据和功能。

---

## 第一部分 · 使用

### 环境要求

- 已按 Noema 官方要求装好开发环境（Node `26.5.0`、npm `11.17.0`）
- 已在 Noema 仓库执行过 `npm ci` 和 `npm run build:aaronnote`

### 安装（三步）

```bash
# 1. 将 Noema 与本补丁克隆到同一目录下（成为兄弟目录）
git clone https://github.com/AaronHnoraA/Noema.git
git clone https://github.com/PWO-CHINA/noema-zh-patch.git

# 2. 构建 Noema 前端（如果之前做过可跳过）
cd Noema && npm ci && npm run build:aaronnote && cd ..

# 3. 运行安装引导（检查环境并打印启动命令）
node noema-zh-patch/install.mjs
```

> Noema 不在兄弟目录也没关系：设置环境变量 `NOEMA_REPO=/你的/Noema路径`，或运行 `node install.mjs --noema /你的/Noema路径`。

### 启动

用补丁的 `zh-main.mjs` 替代 Noema 原始入口启动 Electron：

```bash
# Windows
Noema/node_modules/electron/dist/electron.exe noema-zh-patch/zh-main.mjs

# macOS
Noema/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron noema-zh-patch/zh-main.mjs

# Linux
Noema/node_modules/electron/dist/electron noema-zh-patch/zh-main.mjs
```

建议把这条命令保存为一个快捷方式或 shell 别名，以后双击/回车即可。

### 关闭与卸载

| 需求 | 做法 |
| --- | --- |
| 临时看一次英文界面 | 设 `NOEMA_ZH=0` 再启动，与未打补丁完全一致 |
| 彻底卸载 | 改用 Noema 原始入口 `desktop/main.mjs` 启动；删除本仓库目录。Noema 一侧无需任何清理 |

### 翻译范围

| 已翻译 | 故意不翻译 |
| --- | --- |
| 应用菜单栏与右键菜单（含剪切/复制/全选等系统项） | **你的笔记内容**（编辑器文档区被硬性跳过） |
| 标题栏按钮与悬停提示 | 品牌名（Noema、Jupyter、Wiki、LaTeX、KaTeX、VS Code） |
| Tools 列表、图谱/任务/Jupyter 面板 | 原生文件对话框按钮（由操作系统渲染） |
| 配置页、Wiki 工作台 | 图谱画布内部（canvas 绘制，不在 DOM 中） |
| 状态栏提示（含带数字的动态文案） | 浏览器开发预览（属于开发路径，非日常入口） |
| 文件对话框的标题与文件类型筛选 | |

---

## 第二部分 · 维护

这一部分面向愿意动手让翻译保持最新、最准的用户。

### Noema 升级之后

```bash
cd Noema && git pull && npm ci && npm run build:aaronnote && cd ..
node noema-zh-patch/install.mjs   # 刷新词典的基准 commit
node noema-zh-patch/harvest.mjs   # 对账词典与上游源码
```

`harvest.mjs` 输出三类信息：

1. **新增未翻字符串**——上游新加的界面文案，补进词典即可；
2. **候选废弃条目**——词典里可能已随上游改动失效的 key（人工确认后删除）；
3. **commit 漂移**——词典基准与仓库 HEAD 是否一致。

### 补一条翻译

所有翻译都在 `zh-CN.json` 一个文件里，两种条目：

```jsonc
{
  "exact": {
    // 固定文案：英文 key 必须与源码逐字符一致（含省略号 … 与结尾标点）
    "Save note first": "请先保存笔记"
  },
  "regex": [
    // 带变量的文案：用正则捕获变量，$1 回填
    { "pattern": "^Running (\\d+) Jupyter cells?…$", "replace": "正在运行 $1 个 Jupyter 单元…" }
  ]
}
```

### 找出还没翻译的字符串

```bash
NOEMA_ZH_DEBUG=1 Noema/node_modules/electron/dist/electron.exe noema-zh-patch/zh-main.mjs
```

在界面里正常操作一遍，所有未命中的界面文案会去重后写入 `misses.log`，逐条补进词典即可。每次启动的自检结果（菜单钩子计数、翻译命中率）记录在 `runtime.log`。

---

## 第三部分 · 开发

这一部分面向想了解实现原理、参与改造或向上游贡献的开发者。

### 总体设计

补丁把 Electron 的启动入口从 `desktop/main.mjs` 换成包装器 `zh-main.mjs`。包装器先注册三条翻译通道，再 `await import()` 原始入口——原文件的 `import.meta.url` 不变，其内部所有路径解析不受影响。这就是"零侵入"的实现方式：改动发生在进程内，而不是磁盘上的源码里。

### 三条翻译通道

1. **菜单通道（主进程）**：monkey-patch `Menu.buildFromTemplate`，递归翻译菜单模板中的 `label`。纯 `{ role }` 项（剪切/复制等）在模板阶段写入显式中文 label，role 语义不变。一个钩子同时覆盖应用菜单、右键菜单和未来任何动态菜单；`dialog.showOpenDialog` 的标题与文件筛选同样包装。
2. **页面通道（渲染进程）**：启动时把翻译器打包为 session 级 preload（`session.registerPreloadScript`），在页面脚本之前、首次绘制之前注入每个窗口，翻译在 `DOMContentLoaded` 同步完成——**界面直接以中文出现，无英文闪烁**。翻译器用 TreeWalker 全量替换文本节点与 `title`/`placeholder`/`aria-label` 属性，再以 MutationObserver（50ms 去抖）处理动态新增的内容；`dom-ready` 的 `executeJavaScript` 注入作为兜底路径保留，幂等标志（`data-zh-patched` DOM 属性）保证两条路径不重复执行。
3. **插值通道**：词典 `regex` 节的正则条目，处理 `Running ${n} cells` 这类运行时拼接的文案。

### 安全设计

- **文档区隔离**：TreeWalker 与 MutationObserver 都显式跳过 `.cm-content` 子树，笔记内容不可能被翻译（有自动化验证）。
- **英文兜底**：查不到词典的字符串原样显示；所有 patch 点包 try/catch，异常时退回原文。
- **一键旁路**：`NOEMA_ZH=0` 时包装器什么都不做，直接加载原始入口。
- **自检**：每次启动在 `runtime.log` 记录菜单钩子拦截计数与翻译命中率；上游若重构菜单构建导致钩子失效，日志会明确报警而不是静默失败。

### 为什么不用源码 locale 层

在源码里引入 `t()` 函数是更"正规"的国际化做法，但它要改动上游数百处调用点——对一个活跃开发中的仓库，每次 `git pull` 都是冲突。本补丁选择把复杂度收敛到一个独立词典文件里，换取与上游的彻底解耦。如果未来上游愿意内置多语言，本词典（约 810 条精确条目 + 约 170 条插值模板 + 统一术语表）可以直接作为第一个语言包迁移过去。

### 仓库结构

| 文件 | 职责 |
| --- | --- |
| `zh-CN.json` | 翻译词典：`exact` 精确匹配 / `roles` 菜单 role 文案 / `regex` 插值模板；`meta.syncedCommit` 记录词典的基准 commit |
| `zh-main.mjs` | 主进程包装器（Electron 实际入口） |
| `zh-renderer.js` | 渲染进程翻译器（由包装器注入） |
| `install.mjs` | 安装引导：环境检查、基准 commit 刷新、启动命令生成 |
| `harvest.mjs` | 词典漂移对账：新增未翻 / 候选废弃 / commit 比对 |
| `verify-renderer.mjs` | 渲染层自动化验证（隐藏窗口注入对比） |
| `verify-preload.mjs` | preload 投递验证（dom-ready 时已是中文，无闪烁回归测试） |

### 质量基线

针对 Noema `343edf5` 验证：菜单 label 命中 90/91（唯一未命中为品牌名，有意保留）；主窗口可见 UI 文本 125 条中 110 条中文化（其余为品牌名与图标符号）；编辑器文档区零中文字符。

### 参与贡献

- **修正翻译**：直接 PR 修改 `zh-CN.json`，英文 key 须与源码逐字符一致，遵循既有术语（note→笔记、graph→图谱、agenda→日程、snippet→代码片段、cell→单元等）。
- **适配上游更新**：运行 `node harvest.mjs`，把新增条目连同 `meta.syncedCommit` 一起 PR。
- **报告问题**：Issue 中请附 `runtime.log`；若涉及漏翻，附 `NOEMA_ZH_DEBUG=1` 运行后的 `misses.log`。

## 许可证

[AGPL-3.0-only](LICENSE)，与 Noema 一致——本补丁的任何部分都可以无障碍地回流上游。
