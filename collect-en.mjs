// 英文残留收集器：基于 verify-inject.mjs 的已验证骨架。
// 用法：electron collect-en.mjs <hostUrl> <page>
// page 取值：main | wiki | config | agenda | graph | slides（一次一个页面）
import { app, BrowserWindow, session, net } from "electron";
import { readFileSync } from "node:fs";

const patchDir = "D:/App/Noema/noema-zh-patch";
const hostUrl = process.argv[2];
const page = process.env.PAGE || "main";
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

const routes = {
  main: "/?host=desktop",
  wiki: "/wiki?host=desktop",
  config: "/config?host=desktop",
  agenda: "/agenda?host=desktop",
  graph: "/graph?host=desktop",
  slides: "/slides?host=desktop",
};

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
  const url = `${base}${routes[page] || routes.main}`;
  const win = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { sandbox: true, contextIsolation: true, preload: "D:/App/Noema/Noema/desktop/preload.cjs" } });
  let result;
  try {
    const domReady = new Promise((res) => win.webContents.once("dom-ready", res));
    await win.loadURL(url);
    await domReady;
    await new Promise((r) => setTimeout(r, 4000));
    result = await win.webContents.executeJavaScript(`(() => {
      const out = new Set();
      const keep = (s) => {
        s = s.trim();
        if (!s || s.length > 300) return;
        if (!/[A-Za-z]/.test(s)) return;
        if (/[\\u4e00-\\u9fff]/.test(s)) return;
        if (/[/\\\\]/.test(s) && s.includes(".")) return;
        out.add(s);
      };
      const skip = (node) => {
        for (let el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) {
          if (el.matches && el.matches(".cm-content")) return true;
        }
        return false;
      };
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) { if (!skip(n)) keep(n.nodeValue); }
      for (const el of document.querySelectorAll("[title],[placeholder],[aria-label]")) {
        if (skip(el)) continue;
        for (const a of ["title", "placeholder", "aria-label"]) { const v = el.getAttribute(a); if (v) keep(v); }
      }
      return [...out].sort();
    })()`);
  } catch (err) {
    result = { error: String(err) };
  }
  win.destroy();
  console.log(JSON.stringify({ [page]: result }, null, 2));
  app.quit();
});
