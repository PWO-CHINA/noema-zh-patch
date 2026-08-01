// 中文补丁验证脚本：用 Noema 自带的 Electron 起一个隐藏窗口加载桌面 host 页面，
// 注入 zh-renderer.js + zh-CN.json，对比注入前后的 UI 文本。
// 用法：electron.exe verify-renderer.mjs <hostUrl>
import { app, BrowserWindow } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const patchDir = dirname(fileURLToPath(import.meta.url));
const hostUrl = process.argv[2] || "http://127.0.0.1:19723/?host=desktop";

const rendererSource = readFileSync(join(patchDir, "zh-renderer.js"), "utf8");
const dict = JSON.parse(readFileSync(join(patchDir, "zh-CN.json"), "utf8"));
const injection = `(${rendererSource})(${JSON.stringify({ exact: dict.exact, regex: dict.regex })});`;

const SAMPLE = `(() => {
  const out = { title: document.title, texts: [], attrs: [] };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue.trim();
    if (t && /[A-Za-z\\u4e00-\\u9fff]/.test(t)) out.texts.push(t);
  }
  for (const el of document.querySelectorAll("[title],[placeholder],[aria-label]")) {
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.attrs.push(v);
    }
  }
  const cm = document.querySelector(".cm-content");
  out.cmContentSample = cm ? cm.textContent.slice(0, 200) : null;
  return out;
})()`;

function summarize(sample) {
  const all = [...sample.texts, ...sample.attrs];
  const zh = all.filter((s) => /[一-鿿]/.test(s));
  return { total: all.length, zhCount: zh.length, zhSample: zh.slice(0, 40), enSample: all.filter((s) => !/[一-鿿]/.test(s) && /[A-Za-z]/.test(s)).slice(0, 40) };
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1400, height: 900 });
  try {
    await win.loadURL(hostUrl);
    await new Promise((r) => setTimeout(r, 3000));

    const before = summarize(await win.webContents.executeJavaScript(SAMPLE));
    const injectResult = await win.webContents.executeJavaScript(injection);
    await new Promise((r) => setTimeout(r, 1000));
    const afterSample = await win.webContents.executeJavaScript(SAMPLE);
    const after = summarize(afterSample);

    const report = {
      hostUrl,
      injectResult,
      before: { total: before.total, zhCount: before.zhCount },
      after: { total: after.total, zhCount: after.zhCount },
      titleAfter: afterSample.title,
      zhSample: after.zhSample,
      remainingEnSample: after.enSample,
      cmContentUnchanged: before.cmContentSample === null || afterSample.cmContentSample === before.cmContentSample ? "n/a-or-unchanged" : "CHANGED!",
    };
    writeFileSync(join(patchDir, "verify-report.json"), JSON.stringify(report, null, 2), "utf8");
    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    console.error("verify failed:", err);
    process.exitCode = 1;
  } finally {
    win.destroy();
    app.quit();
  }
});
