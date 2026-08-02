// 验证 protocol.handle <head> bootstrap 注入：sandbox:true 窗口（与 Noema 真实窗口同配置），
// 注册与 zh-main.mjs 相同的 protocol 处理器，断言：
//   ① dom-ready+50ms 时 data-zh-patched 已置位且中文占比达标
//   ② cloak 属性 data-noema-plugins-pending 已被移除（首轮翻译后解除遮罩）
//   ③ .cm-content 内零中文
import { app, BrowserWindow, session, net } from "electron";
import { readFileSync } from "node:fs";

const patchDir = "D:/App/Noema/noema-zh-patch";
const hostUrl = process.argv[2];
const rendererSource = readFileSync(patchDir + "/plugin/renderer.js", "utf8");
const dict = JSON.parse(readFileSync(patchDir + "/plugin/zh-CN.json", "utf8"));
const inlineDict = JSON.stringify({ exact: dict.exact, regex: dict.regex }).replace(/<\//g, "<\\/");
const inlineRenderer = rendererSource.replace(/<\/script/gi, "<\\/script");
const bootstrap =
  `<style id="noema-zh-cloak">html[data-noema-plugins-pending] body{animation:noemaZhFailOpen 1500ms steps(1,end) both;}` +
  `@keyframes noemaZhFailOpen{from{opacity:0;}to{opacity:1;}}</style>` +
  `<script>document.documentElement.setAttribute("data-noema-plugins-pending","1");</script>` +
  `<script>(${inlineRenderer})(${inlineDict});</script>`;

function injectBootstrap(html) {
  const headMatch = /<head[^>]*>/i.exec(html);
  if (headMatch) {
    const at = headMatch.index + headMatch[0].length;
    return html.slice(0, at) + bootstrap + html.slice(at);
  }
  if (html.includes("</body>")) return html.replace("</body>", bootstrap + "</body>");
  return html + bootstrap;
}

app.whenReady().then(async () => {
  session.defaultSession.protocol.handle("http", async (request) => {
    const passthrough = () => net.fetch(request, { bypassCustomProtocolHandlers: true });
    const url = new URL(request.url);
    const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (!isLocal || request.method !== "GET") return passthrough();
    const dest = request.destination || "";
    if (dest && dest !== "document") return passthrough();
    const response = await passthrough();
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;
    const html = await response.text();
    const headers = new Headers(response.headers);
    for (const h of ["content-length", "content-encoding", "etag", "content-md5", "digest", "last-modified"]) headers.delete(h);
    headers.set("cache-control", "no-store");
    return new Response(injectBootstrap(html), { status: response.status, statusText: response.statusText, headers });
  });

  const base = hostUrl.replace(/\/?\?host=desktop$/, "");
  const results = {};
  for (const [name, url] of [["main", `${base}/?host=desktop`]]) {
    const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { sandbox: true, contextIsolation: true } });
    try {
      const domReady = new Promise((res) => win.webContents.once("dom-ready", res));
      await win.loadURL(url);
      await domReady;
      await new Promise((r) => setTimeout(r, 50)); // 紧计时：bootstrap 在解析时已同步执行
      results[name] = await win.webContents.executeJavaScript(`(() => {
        const texts = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) { const t = n.nodeValue.trim(); if (t && /[A-Za-z\\u4e00-\\u9fff]/.test(t)) texts.push(t); }
        const cm = document.querySelector(".cm-content");
        return {
          patched: document.documentElement.hasAttribute("data-zh-patched"),
          cloakPending: document.documentElement.hasAttribute("data-noema-plugins-pending"),
          cloakStylePresent: !!document.getElementById("noema-zh-cloak"),
          total: texts.length,
          zh: texts.filter((s) => /[\\u4e00-\\u9fff]/.test(s)).length,
          enSample: texts.filter((s) => !/[\\u4e00-\\u9fff]/.test(s) && /[A-Za-z]/.test(s)).slice(0, 10),
          cmHasCJK: cm ? /[\\u4e00-\\u9fff]/.test(cm.textContent) : null,
        };
      })()`);
    } catch (err) {
      results[name] = { error: String(err) };
    }
    win.destroy();
  }
  console.log(JSON.stringify(results, null, 2));
  app.quit();
});
