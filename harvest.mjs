// noema-zh-patch - 词典漂移检查脚本。
// 用法：node harvest.mjs [--noema /path/to/Noema]
// ① 从 desktop/main.mjs 提取菜单/对话框字符串，列出词典未覆盖的新增项
// ② 反向列出词典 key 在已翻译源码文件中均不出现的候选废弃项（roles 白名单跳过）
// ③ 比对仓库 HEAD 与词典 meta.syncedCommit，不一致提示需要 re-harvest
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const patchDir = dirname(fileURLToPath(import.meta.url));
const noemaArgIndex = process.argv.indexOf("--noema");

function resolveRepo() {
  const candidates = [];
  if (noemaArgIndex > 0) candidates.push(process.argv[noemaArgIndex + 1]);
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
if (!repo) {
  console.error("未找到 Noema 仓库。用 --noema /path/to/Noema 指定，或设置 NOEMA_REPO。");
  process.exit(1);
}
const dict = JSON.parse(readFileSync(join(patchDir, "zh-CN.json"), "utf8"));

// ③ commit 漂移
let head = "";
try {
  head = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch (err) {
  console.log(`无法读取仓库 HEAD: ${err.message}`);
}
const synced = (dict.meta && dict.meta.syncedCommit) || "";
console.log(`== commit 对账 ==`);
console.log(`词典 syncedCommit: ${synced ? synced.slice(0, 7) : "(空)"}  仓库 HEAD: ${head ? head.slice(0, 7) : "(未知)"}  ${head && synced === head ? "一致" : "不一致，建议 re-harvest"}`);

// ① main.mjs 新增字符串
const mainSrc = readFileSync(join(repo, "desktop", "main.mjs"), "utf8");
const found = new Set();
for (const re of [/label:\s*"([^"]+)"/g, /commandItem\(\s*"([^"]+)"/g, /title:\s*"([^"]+)"/g, /name:\s*"([^"]+)"/g]) {
  for (const m of mainSrc.matchAll(re)) found.add(m[1]);
}
const exactKeys = new Set(Object.keys(dict.exact || {}));
const missing = [...found].filter((s) => !exactKeys.has(s));
console.log(`\n== main.mjs 新增未翻字符串 (${missing.length}) ==`);
for (const s of missing) console.log(`  ${JSON.stringify(s)}`);

// ② 候选废弃 key（在已翻译的源码文件中均找不到原文）
const scannedFiles = [
  "desktop/main.mjs",
  "aaronnote/main.ts",
  "aaronnote/config-main.ts",
  "aaronnote/wiki-main.ts",
  "aaronnote/agenda-view.ts",
  "aaronnote/agenda-main.ts",
  "aaronnote/find.ts",
  "aaronnote/floating-toc.ts",
  "aaronnote/command-palette.ts",
  "aaronnote/snippets.ts",
  "aaronnote/link-preview.ts",
  "aaronnote/prose-check-lifecycle.ts",
];
let corpus = "";
for (const file of scannedFiles) {
  try {
    corpus += readFileSync(join(repo, file), "utf8") + "\n";
  } catch { /* 文件可能被上游删除 */ }
}
const roleKeys = new Set(Object.keys(dict.roles || {}));
const stale = [...exactKeys].filter((key) => {
  if (roleKeys.has(key)) return false; // role 默认文案不出现在源码里
  if (key.length < 3) return false;
  return !corpus.includes(key);
});
console.log(`\n== 词典候选废弃 key (${stale.length}) ==`);
for (const s of stale) console.log(`  ${JSON.stringify(s)}`);
