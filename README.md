# noema-zh-patch — Noema 中文界面补丁

> Noema 简体中文界面。本仓库是其**开发源头**：词典与翻译器在这里维护，定期回流上游。
> 自 Noema `ead7cbf`（插件系统）起，中文界面已作为官方内置插件 **noema.zh-cn** 发布——
> 大多数用户不需要本仓库，直接在 Noema 里启用官方插件即可（见下文「使用」）。

[English README](README.en.md)

---

## 这是什么

[Noema](https://github.com/AaronHnoraA/Noema) 是一款 Typora 风格的 Markdown 编辑器（Web / Electron 桌面端），官方界面原为英文。本项目把桌面端的菜单、面板、按钮、提示等界面文本翻译成中文，覆盖 900+ 条文案。它已被上游以插件形式收编（迁移自本仓库 `8ff36eb`），本仓库继续作为词典与翻译器的开发源头。

三个关键性质：

- **已被官方收编**：上游 `plugins/noema-zh-cn/` 与本仓库 `plugin/` 目录结构一致，`node diff-upstream.mjs` 一条命令核对两边差异。
- **可维护**：词典与源码解耦。上游更新后 `node harvest.mjs` 即可对账新增未翻字符串。
- **绝对安全**：编辑器里的笔记内容永不触碰（`.cm-content` 子树硬性剪枝）；所有翻译逻辑都有英文兜底。

---

## 第一部分 · 使用

### 方式 A：官方内置插件（推荐，Noema ≥ ead7cbf）

无需下载任何东西。打开 Noema → **Configuration → Plugins → 启用 "Noema 简体中文"**，重启 Noema 生效。启停状态记录在用户数据目录的 `plugins.json`。

> 旧版 Noema（无插件系统）才需要方式 B。

### 方式 B：独立补丁包装器（旧版 Noema）

环境要求：Node `26.5.0`、npm `11.17.0`，Noema 仓库执行过 `npm ci` 和 `npm run build:aaronnote`。

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

所有翻译都在 `plugin/zh-CN.json` 一个文件里，两种条目：

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

### 把更新回流上游（官方插件同步流程）

本仓库 `plugin/` 与上游 `Noema/plugins/noema-zh-cn/` 目录结构一一对应：

```bash
node diff-upstream.mjs   # 核对 plugin/ 与上游插件目录的全部差异
```

输出逐文件一致性（plugin.json / main.mjs / renderer.js / README.md）+ 词典条目级 delta（我们新增/值不同/我们缺失）。确认差异就是你要提交的内容后，把 `plugin/` 整体复制到上游 `plugins/noema-zh-cn/` 并提 PR 即可——这就是"后续升级直接被迁移进 main"的路径。

### 找出还没翻译的字符串

```bash
NOEMA_ZH_DEBUG=1 Noema/node_modules/electron/dist/electron.exe noema-zh-patch/zh-main.mjs
```

在界面里正常操作一遍，所有未命中的界面文案会去重后写入 `misses.log`，逐条补进词典即可。每次启动的自检结果（菜单钩子计数、翻译命中率）记录在 `runtime.log`。也可以用 `collect-en.mjs` 对任意页面做残留扫描（见仓库结构表）。

---

## 第三部分 · 开发

这一部分面向想了解实现原理、参与改造或向上游贡献的开发者。

### 总体设计

补丁把 Electron 的启动入口从 `desktop/main.mjs` 换成包装器 `zh-main.mjs`。包装器先注册三条翻译通道，再 `await import()` 原始入口——原文件的 `import.meta.url` 不变，其内部所有路径解析不受影响。这就是"零侵入"的实现方式：改动发生在进程内，而不是磁盘上的源码里。

### 三条翻译通道

1. **菜单通道（主进程）**：monkey-patch `Menu.buildFromTemplate`，递归翻译菜单模板中的 `label`。纯 `{ role }` 项（剪切/复制等）在模板阶段写入显式中文 label，role 语义不变。一个钩子同时覆盖应用菜单、右键菜单和未来任何动态菜单；`dialog.showOpenDialog` 的标题与文件筛选同样包装。
2. **页面通道（渲染进程）**：用 `session.protocol.handle` 拦截本地 host 的 HTML 文档响应，在 `<head>` 最前部注入 bootstrap——顺序为 cloak 样式（`opacity` 隐藏 body，纯 CSS 动画 1.5s 自动放行，JS 全失效也会回英文可见）→ pending 标志 → 翻译器脚本。翻译器在 HTML 解析时同步执行并**立即安装 MutationObserver**（不等 DOMContentLoaded）；Observer 微任务在渲染绘制前运行，回调内**同步翻译**（childList 只处理 addedNodes），首屏 UI 因此以中文直接出现。显式栈遍历在元素层面**真剪枝 `.cm-content`**（不进入整棵子树，大文档编辑不卡）。`dom-ready` 的 `executeJavaScript` 注入作为兜底路径保留，幂等标志（`data-zh-patched` DOM 属性）保证两条路径不重复执行。注意：对 Observer 安装前已存在的 DOM、iframe/Shadow DOM/canvas 内部文本，本机制不覆盖（已知边界）。
3. **插值通道**：词典 `regex` 节的正则条目，处理 `Running ${n} cells` 这类运行时拼接的文案。

### 安全设计

- **文档区隔离**：TreeWalker 与 MutationObserver 都显式跳过 `.cm-content` 子树，笔记内容不可能被翻译（有自动化验证）。
- **英文兜底**：查不到词典的字符串原样显示；所有 patch 点包 try/catch，异常时退回原文。
- **一键旁路**：`NOEMA_ZH=0` 时包装器什么都不做，直接加载原始入口。
- **CSP 前瞻**：页面翻译依赖内联 `<script>`。若上游未来收紧 CSP（禁止 `unsafe-inline`），该通道会失效但 cloak 仍会自动放行回英文；届时迁移到 session preload 或 CDP 注入（已做过机制评估与最小复现）。
- **自检**：每次启动在 `runtime.log` 记录菜单钩子拦截计数与翻译命中率；上游若重构菜单构建导致钩子失效，日志会明确报警而不是静默失败。

### 为什么不用源码 locale 层

在源码里引入 `t()` 函数是更"正规"的国际化做法，但它要改动上游数百处调用点——对一个活跃开发中的仓库，每次 `git pull` 都是冲突。本补丁选择把复杂度收敛到一个独立词典文件里，换取与上游的彻底解耦。如果未来上游愿意内置多语言，本词典（约 810 条精确条目 + 约 170 条插值模板 + 统一术语表）可以直接作为第一个语言包迁移过去。

### 仓库结构

| 文件 | 职责 |
| --- | --- |
| `plugin/` | **与上游 `Noema/plugins/noema-zh-cn/` 镜像对齐的插件目录**（唯一内容来源） |
| `plugin/zh-CN.json` | 翻译词典：`exact` 精确匹配 / `roles` 菜单 role 文案 / `regex` 插值模板；`meta.syncedCommit` 记录词典的基准 commit |
| `plugin/renderer.js` | 渲染进程翻译器（与上游插件版逐行一致） |
| `plugin/main.mjs` | 官方插件宿主 API 的薄适配层（与上游逐行一致） |
| `plugin/plugin.json` | 插件清单（id `noema.zh-cn`） |
| `zh-main.mjs` | 独立补丁包装器（旧版 Noema 的 Electron 入口；词典与渲染器也从 `plugin/` 读取） |
| `install.mjs` | 安装引导：环境检查、基准 commit 刷新、启动命令生成 |
| `harvest.mjs` | 词典漂移对账：新增未翻 / 候选废弃 / commit 比对 |
| `diff-upstream.mjs` | **对齐检查：`plugin/` vs 上游插件目录，输出 PR 就绪的差异清单** |
| `collect-en.mjs` | 页面英文残留扫描器（隐藏窗口，按页面转储未翻译字符串） |
| `verify-renderer.mjs` | 渲染层自动化验证（隐藏窗口注入对比） |
| `verify-inject.mjs` | protocol 注入验证（sandbox 窗口下页面加载即中文，无闪烁回归测试） |

### 质量基线

针对 Noema `ead7cbf` 验证：菜单 label 命中 92/92；官方插件激活日志 `dictionary loaded (exact=917, regex=182)`；Wiki/配置/主页扫描仅剩品牌名、图标符号、数据值与快捷键提示；编辑器文档区零中文字符。

### 参与贡献

- **修正翻译**：直接 PR 修改 `zh-CN.json`，英文 key 须与源码逐字符一致，遵循既有术语（note→笔记、graph→图谱、agenda→日程、snippet→代码片段、cell→单元等）。
- **适配上游更新**：运行 `node harvest.mjs`，把新增条目连同 `meta.syncedCommit` 一起 PR。
- **报告问题**：Issue 中请附 `runtime.log`；若涉及漏翻，附 `NOEMA_ZH_DEBUG=1` 运行后的 `misses.log`。

## 许可证

[AGPL-3.0-only](LICENSE)，与 Noema 一致——本补丁的任何部分都可以无障碍地回流上游。
