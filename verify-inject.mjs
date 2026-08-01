// 验证 protocol.handle HTML 注入：sandbox:true 窗口（与 Noema 真实窗口同配置），
// 注册与 zh-main.mjs 相同的 protocol 处理器，检查页面加载即中文。
import { app, BrowserWindow, session, net } from "electron";
import { readFileSync } from "node:fs";

const patchDir = "D:/App/Noema/noema-zh-patch";
const hostUrl = process.argv[2];
const rendererSource = readFileSync(patchDir + "/zh-renderer.js", "utf8");
const dict = JSON.parse(readFileSync(patchDir + "/zh-CN.json", "utf8"));
const inlineDict = JSON.stringify({ exact: dict.exact, regex: dict.regex }).replace(/<\//g, "<\\/");
const inlineRenderer = rendererSource.replace(/<\/script/gi, "<\\/script");
const inlineScript = `<script>(${inlineRenderer})(${inlineDict});</script>`;

app.whenReady().then(async () => {
  session.defaultSession.protocol.handle("http", async (request) => {
    const url = new URL(request.url);
    const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    const response = await net.fetch(request, { bypassCustomProtocolHandlers: true });
    if (!isLocal || request.method !== "GET") return response;
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const html = await response.text();
    const injected = html.includes("</body>") ? html.replace("</body>", inlineScript + "</body>") : html + inlineScript;
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(injected, { status: response.status, statusText: response.statusText, headers });
  });

  const base = hostUrl.replace(/\/?\?host=desktop$/, "");
  const results = {};
  for (const [name, url] of [["main", `${base}/?host=desktop`], ["wiki", `${base}/wiki?host=desktop`]]) {
    const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { sandbox: true, contextIsolation: true } });
    try {
      const domReady = new Promise((res) => win.webContents.once("dom-ready", res));
      await win.loadURL(url);
      await domReady;
      await new Promise((r) => setTimeout(r, 50)); // 紧计时：HTML 内联脚本在解析时已同步执行
      results[name] = await win.webContents.executeJavaScript(`(() => {
        const texts = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) { const t = n.nodeValue.trim(); if (t && /[A-Za-z\\u4e00-\\u9fff]/.test(t)) texts.push(t); }
        return { patched: document.documentElement.hasAttribute("data-zh-patched"), total: texts.length,
          zh: texts.filter((s) => /[\\u4e00-\\u9fff]/.test(s)).length,
          enSample: texts.filter((s) => !/[\\u4e00-\\u9fff]/.test(s) && /[A-Za-z]/.test(s)).slice(0, 10) };
      })()`);
    } catch (err) {
      results[name] = { error: String(err) };
    }
    win.destroy();
  }
  console.log(JSON.stringify(results, null, 2));
  app.quit();
});
