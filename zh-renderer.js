// Noema 中文补丁 - 渲染进程翻译器。
// 本文件不直接运行；由 zh-main.mjs 读取源码后通过 webContents.executeJavaScript 注入：
//   executeJavaScript(`(${source})(${JSON.stringify(dict)})`)
// 因此本文件必须是一个「接收 dict 参数的函数表达式」，不能有任何顶层副作用语句。
(function zhRenderer(dict) {
  // 幂等标志要跨「隔离世界」可见（preload 与 executeJavaScript 属于不同 JS world，
  // window 标志互不可见），因此以 DOM 属性为共享标志，window 标志作同世界快速路径。
  // 判定与标记都在 start() 内完成：preload 在文档早期运行时 documentElement 可能尚未存在，
  // 此时无法在 DOM 上留标记，只能等到 DOMContentLoaded。
  function alreadyPatched() {
    if (window.__zhPatched) return true;
    var de = document.documentElement;
    return !!(de && de.hasAttribute("data-zh-patched"));
  }
  function markPatched() {
    window.__zhPatched = true;
    try {
      if (document.documentElement) document.documentElement.setAttribute("data-zh-patched", "1");
    } catch (err) { /* ignore */ }
  }
  if (alreadyPatched()) return "already-patched";

  var exact = (dict && dict.exact) || {};
  var regexRules = [];
  for (var i = 0; i < ((dict && dict.regex) || []).length; i++) {
    try {
      regexRules.push({ re: new RegExp(dict.regex[i].pattern), replace: dict.regex[i].replace });
    } catch (err) { /* 跳过坏正则，永不阻断 */ }
  }

  var SKIP_SELECTOR = ".cm-content"; // 编辑器文档区，绝不翻译
  var reportedMisses = {};
  var MISS_CAP = 2000;

  function translateText(s) {
    if (typeof s !== "string" || s.length === 0 || s.length > 500) return null;
    try {
      if (Object.prototype.hasOwnProperty.call(exact, s)) return exact[s];
      // 保留首尾空白的 trim 匹配（词典 key 两种约定都兼容）
      var m = s.match(/^(\s*)(\S[\s\S]*?\S|\S)(\s*)$/);
      if (m && Object.prototype.hasOwnProperty.call(exact, m[2])) return m[1] + exact[m[2]] + m[3];
      for (var i = 0; i < regexRules.length; i++) {
        if (regexRules[i].re.test(s)) return s.replace(regexRules[i].re, regexRules[i].replace);
      }
      if (m) {
        var core = m[2];
        for (var j = 0; j < regexRules.length; j++) {
          if (regexRules[j].re.test(core)) return m[1] + core.replace(regexRules[j].re, regexRules[j].replace) + m[3];
        }
      }
    } catch (err) { /* 返回 null 保持原文 */ }
    return null;
  }

  function looksLikeUiText(s) {
    // 只上报「像英文 UI 文案」的未命中，避免把用户笔记、路径、数据刷进 misses.log
    if (!s || s.length > 120) return false;
    if (!/[A-Za-z]/.test(s)) return false;
    if (!/^[A-Za-z0-9]/.test(s.trim())) return false;
    if (/[/\\]/.test(s)) return false; // 路径
    return true;
  }

  function reportMiss(s) {
    try {
      var key = s.trim();
      if (!looksLikeUiText(key)) return;
      if (reportedMisses[key]) return;
      if (Object.keys(reportedMisses).length >= MISS_CAP) return;
      reportedMisses[key] = true;
      console.log("[NOEMA_ZH_MISS] " + key.replace(/\s+/g, " "));
    } catch (err) { /* ignore */ }
  }

  function isSkipped(node) {
    for (var el = node.nodeType === 1 ? node : node.parentElement; el; el = el.parentElement) {
      if (el.matches && el.matches(SKIP_SELECTOR)) return true;
    }
    return false;
  }

  function translateTextNode(node) {
    if (!node || !node.nodeValue || isSkipped(node)) return;
    var before = node.nodeValue;
    var after = translateText(before);
    if (after !== null && after !== before) {
      node.nodeValue = after;
    } else if (after === null && before.trim().length > 1) {
      reportMiss(before);
    }
  }

  var ATTRS = ["title", "placeholder", "aria-label"];
  function translateElement(el) {
    if (!el || !el.getAttribute || isSkipped(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var attr = ATTRS[i];
      var before = el.getAttribute(attr);
      if (!before) continue;
      var after = translateText(before);
      if (after !== null && after !== before) el.setAttribute(attr, after);
    }
  }

  function walk(root) {
    if (!root) return;
    try {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          var p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.tagName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA") return NodeFilter.FILTER_REJECT;
          return isSkipped(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      var nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (var i = 0; i < nodes.length; i++) translateTextNode(nodes[i]);

      var els = root.querySelectorAll ? root.querySelectorAll("[title],[placeholder],[aria-label]") : [];
      for (var j = 0; j < els.length; j++) translateElement(els[j]);
      if (root.getAttribute) translateElement(root);
    } catch (err) { /* ignore */ }
  }

  function translateTitle() {
    try {
      var t = document.title;
      var after = translateText(t);
      if (after !== null && after !== t) document.title = after;
    } catch (err) { /* ignore */ }
  }

  // MutationObserver 回调是微任务，在渲染绘制之前执行——回调内同步翻译可保证下一帧就是中文。
  // （此前用 50ms debounce 批量处理，延迟越过首帧，导致每页先闪一帧英文。）
  var observer = new MutationObserver(function (mutations) {
    var roots = [];
    var seen = new Set();
    for (var i = 0; i < mutations.length; i++) {
      var mu = mutations[i];
      try {
        if (mu.type === "characterData") {
          translateTextNode(mu.target);
        } else if (mu.type === "attributes") {
          translateElement(mu.target);
        } else if (mu.target && mu.target.nodeType === 1 && !isSkipped(mu.target) && !seen.has(mu.target)) {
          seen.add(mu.target); // childList 变化按父节点去重，walk 一次覆盖全部 addedNodes
          roots.push(mu.target);
        }
      } catch (err) { /* ignore */ }
    }
    for (var k = 0; k < roots.length; k++) walk(roots[k]);
    translateTitle();
  });

  var started = false;
  function start() {
    if (started || alreadyPatched()) return; // 另一个世界可能已完成翻译并挂上观察器
    started = true;
    markPatched();
    walk(document.body);
    translateTitle();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS,
    });
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });

  return "patched";
})
