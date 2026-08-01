// noema-zh-patch - 安装/恢复脚本。
//
// 用法：
//   node install.mjs [--noema /path/to/Noema]   检查环境、刷新词典 syncedCommit、给出启动方式
//   node install.mjs --restore                  恢复（仅限本补丁修改过的启动器）
//
// 两种使用形态：
//   A. 通用形态（推荐）：本仓库 clone 为 Noema 的兄弟目录，脚本打印启动命令。
//   B. 托管启动器形态：若检测到上一级的 start-noema-desktop.mjs（特定 Windows 工作区），
//      自动把其中的 Electron 入口参数切换为 zh-main.mjs（幂等，首次备份 .bak）。
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const patchDir = dirname(fileURLToPath(import.meta.url));
const restore = process.argv.includes("--restore");
const noemaArgIndex = process.argv.indexOf("--noema");
const noemaArg = noemaArgIndex > 0 ? process.argv[noemaArgIndex + 1] : null;

function resolveRepo() {
  const candidates = [];
  if (noemaArg) candidates.push(noemaArg);
  if (process.env.NOEMA_REPO) candidates.push(process.env.NOEMA_REPO);
  candidates.push(
    join(patchDir, "..", "Noema"),
    join(patchDir, "..", "..", "Noema"),
    join(patchDir, "..", "..", "..", "Noema"),
  );
  for (const dir of candidates) {
    if (existsSync(join(dir, "desktop", "main.mjs"))) return dir;
  }
  return null;
}

const repo = resolveRepo();

function refreshSyncedCommit() {
  if (!repo) return;
  try {
    const head = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const dictPath = join(patchDir, "zh-CN.json");
    const dict = JSON.parse(readFileSync(dictPath, "utf8"));
    dict.meta = { ...(dict.meta || {}), syncedCommit: head, syncedDate: new Date().toISOString().slice(0, 10) };
    writeFileSync(dictPath, JSON.stringify(dict, null, 2), "utf8");
    console.log(`meta.syncedCommit 已刷新: ${head.slice(0, 7)}`);
  } catch (err) {
    console.log(`meta.syncedCommit 刷新失败（不影响使用）: ${err.message}`);
  }
}

// 托管启动器（形态 B）
const launcher = join(patchDir, "..", "start-noema-desktop.mjs");
const backup = launcher + ".bak";
const zhMain = join(patchDir, "zh-main.mjs").replace(/\\/g, "/");
const entryPattern = /join\(repo,\s*"desktop",\s*"main\.mjs"\)/;

if (existsSync(launcher)) {
  const source = readFileSync(launcher, "utf8");
  if (restore) {
    if (existsSync(backup)) {
      copyFileSync(backup, launcher);
      console.log(`已从备份还原: ${backup}`);
    } else if (source.includes("zh-main.mjs")) {
      const restored = source.replace(/["'][^"']*zh-main\.mjs["']/, 'join(repo, "desktop", "main.mjs")');
      if (restored !== source) {
        writeFileSync(launcher, restored, "utf8");
        console.log("已还原启动入口");
      }
    } else {
      console.log("启动器未打补丁，无需还原");
    }
    process.exit(0);
  }
  if (source.includes("zh-main.mjs")) {
    console.log("启动器入口已指向 zh-main.mjs，no-op");
  } else if (entryPattern.test(source)) {
    copyFileSync(launcher, backup);
    writeFileSync(launcher, source.replace(entryPattern, JSON.stringify(zhMain)), "utf8");
    console.log(`已备份: ${backup}`);
    console.log(`启动器入口已切换 -> ${zhMain}`);
  } else {
    console.log("警告: 启动器入口参数形态无法识别，未改动（请人工检查 start-noema-desktop.mjs）");
  }
  refreshSyncedCommit();
  console.log("完成。照常启动 Noema 即为中文界面。");
  process.exit(0);
}

// 通用形态（形态 A）
if (restore) {
  console.log("通用形态无需 restore：直接用原始入口 desktop/main.mjs 启动即为未打补丁状态。");
  process.exit(0);
}

console.log(`Noema 仓库: ${repo || "(未找到)"}`);
if (!repo) {
  console.log("未找到 Noema 仓库。请用 --noema /path/to/Noema 指定，或设置 NOEMA_REPO，或将本仓库 clone 为 Noema 的兄弟目录。");
  process.exit(1);
}

const electronBin = platform() === "darwin"
  ? join(repo, "node_modules", "electron", "dist", "Electron.app", "Contents", "MacOS", "Electron")
  : join(repo, "node_modules", "electron", "dist", platform() === "win32" ? "electron.exe" : "electron");
console.log(`Electron: ${existsSync(electronBin) ? electronBin : "未找到（先在 Noema 仓库执行 npm ci）"}`);

refreshSyncedCommit();

console.log(`
启动中文界面（开发模式）：

  "${electronBin}" "${zhMain}"

请先确认已在 Noema 仓库执行过 npm run build:aaronnote（生成 dist/aaronnote）。
关闭补丁：设 NOEMA_ZH=0 启动，或直接用 Noema 原始的 desktop/main.mjs 入口。
收集未翻译字符串：NOEMA_ZH_DEBUG=1 启动，结果写入 misses.log。
升级 Noema 后：重新运行本脚本刷新 syncedCommit，再运行 node harvest.mjs 对账词典。
`);
