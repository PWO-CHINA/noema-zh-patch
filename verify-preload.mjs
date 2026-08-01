// 验证 session preload 投递：注册 zh-preload.bundle.js 后加载页面，
// 不做任何手动注入，检查 dom-ready 后 UI 已是中文。
import { app, BrowserWindow, session } from "electron";

const bundle = "D:/App/Noema/noema-zh-patch/zh-preload.bundle.js";
const hostUrl = process.argv[2];

const SAMPLE = `(() => {
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const t = n.nodeValue.trim();
    if (t && /[A-Za-z\\u4e00-\\u9fff]/.test(t)) texts.push(t);
  }
  const zh = texts.filter((s) => /[\\u4e00-\\u9fff]/.test(s));
  const en = texts.filter((s) => !/[\\u4e00-\\u9fff]/.test(s) && /[A-Za-z]/.test(s));
  return { patched: !!(window.__zhPatched || document.documentElement.hasAttribute("data-zh-patched")), total: texts.length, zh: zh.length, enSample: en.slice(0, 15), zhSample: zh.slice(0, 10) };
})()`;

app.whenReady().then(async () => {
  const ses = session.defaultSession;
  if (typeof ses.registerPreloadScript === "function") {
    ses.registerPreloadScript({ type: "frame", filePath: bundle, id: "noema-zh-patch" });
  } else {
    ses.setPreloads([bundle]);
  }
  const base = hostUrl.replace(/\/?\?host=desktop$/, "");
  const results = {};
  for (const [name, url] of [["main", `${base}/?host=desktop`], ["wiki", `${base}/wiki?host=desktop`]]) {
    try {
      const win = new BrowserWindow({ show: false, width: 1400, height: 900 });
      const domReady = new Promise((res) => win.webContents.once("dom-ready", res));
      await win.loadURL(url);
      await domReady;
      await new Promise((r) => setTimeout(r, 300)); // 只等 300ms：preload 在 DCL 已同步完成翻译
      results[name] = await win.webContents.executeJavaScript(SAMPLE);
      win.destroy();
    } catch (err) {
      results[name] = { error: String(err) };
    }
  }
  console.log(JSON.stringify(results, null, 2));
  app.quit();
});
