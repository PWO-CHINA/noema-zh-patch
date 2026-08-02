// noema-zh-patch - 与上游插件目录的对齐状态检查。
// 用法：node diff-upstream.mjs [--noema /path/to/Noema]
// 对比本仓库 plugin/ 与 Noema 仓库 plugins/noema-zh-cn/：
//   ① plugin.json / main.mjs / renderer.js / README.md 是否内容一致（忽略换行符差异）
//   ② zh-CN.json 条目级差异（我们新增/修改/上游独有的条目数与清单）
// 退出码：全部一致为 0，存在差异为 1（方便接入脚本）。
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const patchDir = dirname(fileURLToPath(import.meta.url));
const argIndex = process.argv.indexOf("--noema");

function resolveRepo() {
  const candidates = [];
  if (argIndex > 0) candidates.push(process.argv[argIndex + 1]);
  if (process.env.NOEMA_REPO) candidates.push(process.env.NOEMA_REPO);
  candidates.push(
    join(patchDir, "..", "Noema"),
    join(patchDir, "..", "..", "Noema"),
    join(patchDir, "..", "..", "..", "Noema"),
  );
  for (const dir of candidates) {
    if (existsSync(join(dir, "plugins", "noema-zh-cn", "plugin.json"))) return dir;
  }
  return null;
}

const repo = resolveRepo();
if (!repo) {
  console.error("未找到上游插件目录（Noema/plugins/noema-zh-cn）。用 --noema 指定仓库路径。");
  process.exit(2);
}
const upstreamDir = join(repo, "plugins", "noema-zh-cn");
const oursDir = join(patchDir, "plugin");

const normalize = (text) => text.replace(/\r\n/g, "\n");
let diverged = false;

for (const file of ["plugin.json", "main.mjs", "renderer.js", "README.md"]) {
  const ours = readFileSync(join(oursDir, file), "utf8");
  let theirs = null;
  try {
    theirs = readFileSync(join(upstreamDir, file), "utf8");
  } catch { /* 上游缺失 */ }
  if (theirs === null) {
    console.log(`${file}: 上游缺失`);
    diverged = true;
  } else if (normalize(ours) === normalize(theirs)) {
    console.log(`${file}: 一致`);
  } else {
    console.log(`${file}: 有差异`);
    diverged = true;
  }
}

const ours = JSON.parse(readFileSync(join(oursDir, "zh-CN.json"), "utf8"));
const theirs = JSON.parse(readFileSync(join(upstreamDir, "zh-CN.json"), "utf8"));

function dictDelta(ours, theirs, label) {
  const added = []; // 我们有、上游没有
  const changed = []; // 两边都有但值不同
  const removed = []; // 上游有、我们没有
  for (const [k, v] of Object.entries(ours)) {
    if (!(k in theirs)) added.push(k);
    else if (theirs[k] !== v) changed.push(k);
  }
  for (const k of Object.keys(theirs)) if (!(k in ours)) removed.push(k);
  console.log(`zh-CN.json ${label}: 我们新增 ${added.length} / 值不同 ${changed.length} / 我们缺失 ${removed.length}`);
  return { added, changed, removed };
}

const exactDelta = dictDelta(ours.exact || {}, theirs.exact || {}, "exact");
const rolesDelta = dictDelta(ours.roles || {}, theirs.roles || {}, "roles");

const ourPatterns = new Set((ours.regex || []).map((r) => r.pattern));
const theirPatterns = new Set((theirs.regex || []).map((r) => r.pattern));
const regexAdded = [...ourPatterns].filter((p) => !theirPatterns.has(p));
const regexRemoved = [...theirPatterns].filter((p) => !ourPatterns.has(p));
const regexChanged = [];
for (const r of ours.regex || []) {
  if (theirPatterns.has(r.pattern)) {
    const u = (theirs.regex || []).find((x) => x.pattern === r.pattern);
    if (u && u.replace !== r.replace) regexChanged.push(r.pattern);
  }
}
console.log(`zh-CN.json regex: 我们新增 ${regexAdded.length} / 替换文本不同 ${regexChanged.length} / 我们缺失 ${regexRemoved.length}`);

if (exactDelta.added.length || exactDelta.changed.length || exactDelta.removed.length ||
    rolesDelta.added.length || rolesDelta.changed.length || rolesDelta.removed.length ||
    regexAdded.length || regexRemoved.length || regexChanged.length) {
  diverged = true;
  const show = (title, list) => {
    if (!list.length) return;
    console.log(`\n${title} (前 20 条):`);
    for (const k of list.slice(0, 20)) console.log(`  ${JSON.stringify(k)}`);
    if (list.length > 20) console.log(`  … 共 ${list.length} 条`);
  };
  show("我们新增 exact", exactDelta.added);
  show("值不同 exact", exactDelta.changed);
  show("我们缺失 exact", exactDelta.removed);
  show("我们新增 regex", regexAdded);
  show("我们缺失 regex", regexRemoved);
}

console.log(diverged ? "\n结论：存在差异，可把 plugin/ 整体提交为上游 PR。" : "\n结论：与上游插件完全一致。");
process.exit(diverged ? 1 : 0);
