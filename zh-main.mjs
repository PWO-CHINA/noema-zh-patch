// noema-zh-patch - Electron main-process wrapper (Chinese UI for Noema).
// Launch this file as the Electron entry instead of Noema's desktop/main.mjs.
// It registers translation hooks, then imports the original entry unchanged.
//
// Locating the Noema repo (first match wins):
//   1. NOEMA_REPO environment variable
//   2. ../Noema            (this repo cloned as a sibling of the Noema repo)
//   3. ../../Noema         (this repo at <workspace>/.cache/zh-patch style layouts)
//   4. ../../../Noema
//
// Failure rule: any error falls back to the original English behavior.
import { app, Menu, dialog, session, net } from "electron";
import { existsSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const patchDir = dirname(fileURLToPath(import.meta.url));
const runtimeLog = join(patchDir, "runtime.log");
const missesLog = join(patchDir, "misses.log");

const DEBUG = process.env.NOEMA_ZH_DEBUG === "1";
const DISABLED = process.env.NOEMA_ZH === "0";

function resolveOriginalMain() {
  const candidates = [];
  if (process.env.NOEMA_REPO) candidates.push(process.env.NOEMA_REPO);
  candidates.push(
    join(patchDir, "..", "Noema"),
    join(patchDir, "..", "..", "Noema"),
    join(patchDir, "..", "..", "..", "Noema"),
  );
  for (const dir of candidates) {
    const main = join(dir, "desktop", "main.mjs");
    if (existsSync(main)) return main;
  }
  return null;
}

function log(line) {
  const text = `[zh-patch] ${line}`;
  try {
    process.stderr.write(text + "\n");
  } catch { /* stdio may be ignored by the launcher */ }
  try {
    appendFileSync(runtimeLog, `${new Date().toISOString()} ${text}\n`, "utf8");
  } catch { /* ignore */ }
}

async function loadOriginal() {
  const mainPath = resolveOriginalMain();
  if (!mainPath) {
    log("FATAL: 找不到 Noema 仓库的 desktop/main.mjs。请设置 NOEMA_REPO 环境变量，或将本仓库 clone 为 Noema 的兄弟目录。");
    return;
  }
  try {
    await import(pathToFileURL(mainPath).href);
  } catch (err) {
    log(`FATAL: 无法加载原始 desktop/main.mjs: ${err && err.stack ? err.stack : err}`);
  }
}

if (DISABLED) {
  await loadOriginal();
} else {
  try {
    writeFileSync(runtimeLog, `${new Date().toISOString()} [zh-patch] 启动\n`, "utf8");
  } catch { /* ignore */ }

  let dict = null;
  try {
    dict = JSON.parse(readFileSync(join(patchDir, "zh-CN.json"), "utf8"));
  } catch (err) {
    log(`词典读取失败，按未打补丁运行: ${err && err.message ? err.message : err}`);
  }

  if (!dict || !dict.exact) {
    await loadOriginal();
  } else {
    const exact = dict.exact || {};
    const roles = dict.roles || {};
    const regexRules = [];
    for (const rule of dict.regex || []) {
      try {
        regexRules.push({ re: new RegExp(rule.pattern), replace: rule.replace });
      } catch { /* skip broken patterns */ }
    }

    function translateText(s) {
      if (typeof s !== "string" || s.length === 0 || s.length > 500) return null;
      try {
        if (Object.prototype.hasOwnProperty.call(exact, s)) return exact[s];
        const m = s.match(/^(\s*)(\S[\s\S]*?\S|\S)(\s*)$/);
        if (m && Object.prototype.hasOwnProperty.call(exact, m[2])) return m[1] + exact[m[2]] + m[3];
        for (const { re, replace } of regexRules) {
          if (re.test(s)) return s.replace(re, replace);
        }
      } catch { /* keep original */ }
      return null;
    }

    // role 名 → Electron 英文默认文案 → 词典 roles 节
    const roleDefaults = {
      about: "About",
      services: "Services",
      hide: "Hide",
      hideothers: "Hide Others",
      unhide: "Show All",
      quit: "Quit",
      close: "Close",
      cut: "Cut",
      copy: "Copy",
      paste: "Paste",
      selectall: "Select All",
      resetzoom: "Actual Size",
      zoomin: "Zoom In",
      zoomout: "Zoom Out",
      toggledevtools: "Toggle Developer Tools",
      togglefullscreen: "Toggle Full Screen",
      minimize: "Minimize",
      zoom: "Zoom",
      front: "Bring All to Front",
      undo: "Undo",
      redo: "Redo",
      filemenu: "File",
      editmenu: "Edit",
      viewmenu: "View",
      windowmenu: "Window",
      help: "Help",
      delete: "Delete",
      reload: "Reload",
      forcereload: "Force Reload",
    };

    let menuInterceptCount = 0;
    let protocolRequestCount = 0;
    let htmlInjectCount = 0;
    let menuLabelTotal = 0;
    let menuLabelHit = 0;
    const menuLabelMisses = new Set();

    function translateTemplate(template) {
      if (!Array.isArray(template)) return template;
      return template.map((item) => {
        if (!item || typeof item !== "object") return item;
        if (item.type === "separator") return item;
        const clone = { ...item };
        if (typeof clone.label === "string" && clone.label) {
          if (/[一-鿿]/.test(clone.label)) return clone; // 已翻译过的二次加工，跳过
          menuLabelTotal++;
          const zh = translateText(clone.label);
          if (zh !== null) {
            menuLabelHit++;
            clone.label = zh;
          } else if (!menuLabelMisses.has(clone.label)) {
            menuLabelMisses.add(clone.label);
            log(`菜单 label 未命中: ${JSON.stringify(clone.label)}`);
          }
        } else if (clone.role && !clone.label) {
          const key = String(clone.role).toLowerCase();
          const en = roleDefaults[key];
          if (en && Object.prototype.hasOwnProperty.call(roles, en)) {
            menuLabelTotal++;
            menuLabelHit++;
            clone.label = roles[en]; // 显式 label 优先于 role 默认文案，role 语义不变
          } else if (!menuLabelMisses.has(`role:${key}`)) {
            menuLabelMisses.add(`role:${key}`);
            log(`菜单 role 未命中: ${JSON.stringify(clone.role)}`);
          }
        }
        if (Array.isArray(clone.submenu)) clone.submenu = translateTemplate(clone.submenu);
        return clone;
      });
    }

    // 通道 1：monkey-patch Menu.buildFromTemplate（同时覆盖应用菜单与右键菜单）
    try {
      const originalBuildFromTemplate = Menu.buildFromTemplate.bind(Menu);
      Menu.buildFromTemplate = function patchedBuildFromTemplate(template) {
        menuInterceptCount++;
        try {
          return originalBuildFromTemplate(translateTemplate(template));
        } catch (err) {
          log(`菜单模板翻译异常，退回原文: ${err && err.message ? err.message : err}`);
          return originalBuildFromTemplate(template);
        }
      };
    } catch (err) {
      log(`Menu.buildFromTemplate patch 失败: ${err && err.message ? err.message : err}`);
    }

    // 通道 1 补充：文件对话框 title / filters[].name
    try {
      const originalShowOpenDialog = dialog.showOpenDialog.bind(dialog);
      dialog.showOpenDialog = function patchedShowOpenDialog(...args) {
        try {
          const opts = args[args.length - 1];
          if (opts && typeof opts === "object") {
            if (typeof opts.title === "string" && opts.title) {
              const zh = translateText(opts.title);
              if (zh !== null) opts.title = zh;
            }
            if (Array.isArray(opts.filters)) {
              for (const filter of opts.filters) {
                if (filter && typeof filter.name === "string" && filter.name) {
                  const zh = translateText(filter.name);
                  if (zh !== null) filter.name = zh;
                }
              }
            }
          }
        } catch { /* fall back to original */ }
        return originalShowOpenDialog(...args);
      };
    } catch (err) {
      log(`dialog.showOpenDialog patch 失败: ${err && err.message ? err.message : err}`);
    }

    // 通道 2/3：向每个窗口注入渲染进程翻译器
    let rendererSource = "";
    try {
      rendererSource = readFileSync(join(patchDir, "zh-renderer.js"), "utf8");
    } catch (err) {
      log(`zh-renderer.js 读取失败，仅菜单翻译生效: ${err && err.message ? err.message : err}`);
    }
    const seenMisses = new Set();

    if (rendererSource) {
      const injection = `(${rendererSource})(${JSON.stringify({ exact, regex: dict.regex || [] })});`;
      // HTML 内联脚本形态：转义 </script 防止提前闭合；JSON 中的 <\/ 在 JS 字符串里等价于 </
      const inlineDict = JSON.stringify({ exact, regex: dict.regex || [] }).replace(/<\//g, "<\\/");
      const inlineRenderer = rendererSource.replace(/<\/script/gi, "<\\/script");
      const inlineScript = `<script>(${inlineRenderer})(${inlineDict});</script>`;

      // 首选投递方式：protocol.handle 拦截本地 host 的 HTML 响应，把翻译器内联进页面。
      // 脚本在 HTML 解析时同步执行，早于首次绘制（无英文闪烁），且不受窗口 sandbox 限制
      // （session 级 preload 在 sandbox:true 的窗口里不可用，已实测验证）。
      const injectedSessions = new WeakSet();
      const ensureHtmlInjection = (ses) => {
        try {
          if (!ses || injectedSessions.has(ses)) return;
          ses.protocol.handle("http", async (request) => {
            protocolRequestCount++;
            try {
              const url = new URL(request.url);
              const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost";
              // bypassCustomProtocolHandlers 是必须的：net.fetch 默认也走协议处理器，会无限递归
              const response = await net.fetch(request, { bypassCustomProtocolHandlers: true });
              if (!isLocal || request.method !== "GET") return response;
              const type = response.headers.get("content-type") || "";
              if (!type.includes("text/html")) return response;
              const html = await response.text();
              htmlInjectCount++;
              const injected = html.includes("</body>")
                ? html.replace("</body>", inlineScript + "</body>")
                : html + inlineScript;
              const headers = new Headers(response.headers);
              headers.delete("content-length");
              return new Response(injected, {
                status: response.status,
                statusText: response.statusText,
                headers,
              });
            } catch (err) {
              log(`HTML 注入异常，按原样放行: ${err && err.message ? err.message : err}`);
              return net.fetch(request, { bypassCustomProtocolHandlers: true });
            }
          });
          injectedSessions.add(ses);
        } catch (err) {
          log(`protocol 注入注册失败: ${err && err.message ? err.message : err}`);
        }
      };
      // 在原 main.mjs 建窗之前注册（本回调先于原始入口注册，whenReady 按序触发）
      app.whenReady().then(() => ensureHtmlInjection(session.defaultSession)).catch(() => { /* ignore */ });

      app.on("web-contents-created", (_event, contents) => {
        try {
          if (contents.getType() !== "window") return; // 跳过 devtools 等
          ensureHtmlInjection(contents.session); // 覆盖自定义 session
          // 兜底：protocol 注入未覆盖到的 contents，仍按 dom-ready 注入。
          // zh-renderer.js 的 data-zh-patched 幂等标志保证两条路径不重复执行。
          contents.on("dom-ready", () => {
            contents.executeJavaScript(injection).catch((err) => {
              log(`注入失败: ${err && err.message ? err.message : err}`);
            });
          });
          if (DEBUG) {
            contents.on("console-message", (_ev, _level, message) => {
              try {
                if (typeof message !== "string" || !message.startsWith("[NOEMA_ZH_MISS] ")) return;
                const miss = message.slice("[NOEMA_ZH_MISS] ".length).trim();
                if (!miss || seenMisses.has(miss)) return;
                seenMisses.add(miss);
                appendFileSync(missesLog, JSON.stringify(miss) + "\n", "utf8");
              } catch { /* ignore */ }
            });
          }
        } catch (err) {
          log(`web-contents-created 钩子异常: ${err && err.message ? err.message : err}`);
        }
      });
    }

    // 自检：首个窗口加载后检查菜单钩子是否真的被调用过
    app.whenReady().then(() => {
      setTimeout(() => {
        if (menuInterceptCount === 0) {
          log("警告: Menu.buildFromTemplate 拦截计数为 0，补丁钩子未生效（上游可能已重构菜单构建）");
        } else {
          log(`菜单钩子正常: 拦截 ${menuInterceptCount} 次, label 翻译命中 ${menuLabelHit}/${menuLabelTotal}`);
        }
        log(`protocol 注入自检: HTTP 请求拦截 ${protocolRequestCount} 次, HTML 注入 ${htmlInjectCount} 次`);
      }, 5000);
    }).catch(() => { /* ignore */ });

    log(`词典已加载: exact=${Object.keys(exact).length} regex=${regexRules.length} roles=${Object.keys(roles).length}${DEBUG ? " [DEBUG]" : ""}`);
    await loadOriginal();
  }
}
