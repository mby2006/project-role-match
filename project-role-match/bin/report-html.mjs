const themeStorageKey = "project-role-match-theme";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

function renderBlock(block) {
  const lines = block.split("\n");
  const parts = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    parts.push(`<p>${paragraph.map(renderInline).join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    parts.push(
      `<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.tag}>`,
    );
    list = null;
  };

  for (const line of lines) {
    const item = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)$/);
    if (item) {
      flushParagraph();
      const tag = item[2] ? "ol" : "ul";
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(renderInline(item[3]));
    } else if (list && line.trim()) {
      list.items[list.items.length - 1] += `<br>${renderInline(line.trim())}`;
    } else if (!list) {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return parts.join("\n");
}

function renderRichText(value) {
  return String(value)
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map(renderBlock)
    .filter(Boolean)
    .join("\n");
}

function citationLine(citation) {
  return citation.endLine === citation.startLine
    ? `第 ${citation.startLine} 行`
    : `第 ${citation.startLine}–${citation.endLine} 行`;
}

const styles = `
*, *::before, *::after { box-sizing: border-box; }
:root {
  color-scheme: light;
  --bg: #f6f6f3;
  --surface: #ffffff;
  --surface-2: #f1f2ee;
  --text: #1d2126;
  --muted: #626b76;
  --border: #e1e3df;
  --border-strong: #cfd3cc;
  --accent: #0f766e;
  --accent-soft: #d9efec;
  --code-bg: #eceee9;
  --warn: #b45309;
  --warn-soft: #fdf3e3;
  --shadow: 0 1px 2px rgba(24, 30, 34, .05), 0 12px 32px rgba(24, 30, 34, .06);
  --mono: ui-monospace, SFMono-Regular, "Cascadia Code", Consolas, "Liberation Mono", monospace;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --bg: #121516;
  --surface: #191d1f;
  --surface-2: #202527;
  --text: #e7e9e7;
  --muted: #9aa4a2;
  --border: #2b3234;
  --border-strong: #3a4244;
  --accent: #5eead4;
  --accent-soft: #123a36;
  --code-bg: #242b2d;
  --warn: #fbbf24;
  --warn-soft: #2a2316;
  --shadow: none;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --bg: #121516;
    --surface: #191d1f;
    --surface-2: #202527;
    --text: #e7e9e7;
    --muted: #9aa4a2;
    --border: #2b3234;
    --border-strong: #3a4244;
    --accent: #5eead4;
    --accent-soft: #123a36;
    --code-bg: #242b2d;
    --warn: #fbbf24;
    --warn-soft: #2a2316;
    --shadow: none;
  }
}
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 16px;
  line-height: 1.75;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); }
code {
  font-family: var(--mono);
  font-size: .9em;
  background: var(--code-bg);
  padding: .14em .38em;
  border-radius: 4px;
}
.skip {
  position: absolute;
  left: 16px;
  top: 8px;
  z-index: 30;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  transform: translateY(-200%);
  transition: transform .15s ease;
}
.skip:focus { transform: translateY(0); }
.layout {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  gap: 48px;
  max-width: 1180px;
  margin: 0 auto;
  padding: 48px 28px 88px;
}
.sidebar {
  position: sticky;
  top: 32px;
  align-self: start;
  max-height: calc(100vh - 64px);
  overflow: auto;
}
.brand {
  margin: 0;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--muted);
}
.brand::before {
  content: "";
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--accent);
  vertical-align: 1px;
}
.sidebar nav {
  display: grid;
  gap: 3px;
  margin-top: 20px;
}
.sidebar nav a {
  display: flex;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--muted);
  text-decoration: none;
  font-size: 13.5px;
  line-height: 1.45;
}
.sidebar nav a:hover { color: var(--text); background: var(--surface-2); }
.sidebar nav a span {
  flex: none;
  padding-top: 2px;
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--accent);
}
.sidebar-note {
  margin: 24px 0 0;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}
main { min-width: 0; }
.hero {
  padding: 4px 0 28px;
  margin-bottom: 24px;
  border-bottom: 1px solid var(--border);
}
.eyebrow {
  margin: 0;
  font-family: var(--mono);
  font-size: 11.5px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--accent);
}
h1 {
  margin: 10px 0 0;
  font-size: clamp(30px, 4.2vw, 46px);
  line-height: 1.12;
  letter-spacing: -.025em;
}
.hero-sub {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 14px;
}
.card {
  padding: 26px 28px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.overview-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.overview h2 { margin: 0; font-size: 20px; letter-spacing: -.01em; }
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  color: var(--muted);
  font-size: 12.5px;
}
.stats strong {
  margin-right: 3px;
  color: var(--text);
  font-size: 16px;
  font-weight: 600;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px 24px;
  margin: 20px 0 0;
}
.facts > div {
  padding-left: 12px;
  border-left: 2px solid var(--accent-soft);
}
.facts dt {
  font-size: 11px;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--muted);
}
.facts dd { margin: 4px 0 0; font-size: 14px; }
.facts dd p { margin: 0; }
.summary { display: grid; gap: 10px; margin-top: 20px; }
.summary-item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 14px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
  color: var(--text);
  text-decoration: none;
  transition: border-color .15s ease;
}
.summary-item:hover { border-color: var(--accent); }
.summary-item strong { color: var(--accent); font-size: 13.5px; }
.summary-item span { color: var(--muted); font-size: 13.5px; }
.empty { margin: 0; color: var(--muted); }
.details-heading {
  margin: 36px 0 4px;
  font-size: 12px;
  letter-spacing: .14em;
  text-transform: uppercase;
  color: var(--muted);
}
.match {
  margin-top: 20px;
  scroll-margin-top: 24px;
}
.match-head { display: flex; align-items: flex-start; gap: 16px; }
.match-index {
  flex: none;
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--border-strong);
  border-radius: 50%;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--muted);
}
.badge {
  display: inline-block;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: .03em;
}
.match h2 {
  margin: 8px 0 0;
  font-size: 22px;
  line-height: 1.3;
  letter-spacing: -.01em;
}
.requirement {
  margin: 16px 0 0;
  padding: 10px 14px;
  border-radius: 10px;
  background: var(--surface-2);
  font-size: 14px;
}
.requirement .label {
  display: inline-block;
  margin-right: 10px;
  color: var(--muted);
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.block {
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px dashed var(--border);
}
.block h3 {
  margin: 0 0 10px;
  font-size: 11.5px;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 600;
}
.block p { margin: 0 0 10px; }
.block p:last-child { margin-bottom: 0; }
.block ul, .block ol { margin: 0 0 10px; padding-left: 1.4em; }
.block li { margin: 4px 0; }
.evidence { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.evidence li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
}
.evidence a { color: var(--accent); text-decoration: none; font-weight: 500; }
.evidence a:hover { text-decoration: underline; text-underline-offset: 3px; }
.evidence .lines { color: var(--muted); font-size: 12.5px; }
.qa {
  margin-top: 10px;
  padding: 0 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}
.qa summary {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 13px 0;
  list-style: none;
  cursor: pointer;
  font-size: 14.5px;
  font-weight: 500;
}
.qa summary::-webkit-details-marker { display: none; }
.qa summary::after {
  content: "+";
  margin-left: auto;
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
}
.qa[open] summary::after { content: "−"; }
.qa summary .q-index {
  flex: none;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
}
.qa summary .q-text { min-width: 0; }
.qa[open] { padding-bottom: 16px; }
.qa-answer {
  margin-top: 2px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  font-size: 14px;
}
.qa-answer p:first-child { margin-top: 0; }
.gaps {
  margin-top: 24px;
  padding: 22px 24px;
  border: 0;
  border-left: 4px solid var(--warn);
  border-radius: 4px 12px 12px 4px;
  background: var(--warn-soft);
  box-shadow: none;
}
.gaps h2 { margin: 0 0 10px; font-size: 18px; }
.gaps ul { margin: 0; padding-left: 1.3em; }
.gaps li { margin: 6px 0; }
.gaps p { margin: 0; }
.footer {
  margin-top: 36px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
}
.theme-toggle {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
  box-shadow: var(--shadow);
}
.theme-toggle:hover { border-color: var(--border-strong); }
.theme-toggle .dot {
  width: 11px;
  height: 11px;
  border: 1px solid var(--text);
  border-radius: 50%;
  background: linear-gradient(90deg, var(--text) 50%, transparent 50%);
}
.theme-toggle:focus-visible, .sidebar nav a:focus-visible, .summary-item:focus-visible, .qa summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; gap: 24px; padding: 28px 18px 64px; }
  .sidebar { position: static; max-height: none; }
  .sidebar nav { display: flex; flex-wrap: wrap; gap: 8px; }
  .sidebar nav a {
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
  }
  .sidebar-note { display: none; }
  .hero { padding-right: 92px; }
}
@media (max-width: 560px) {
  .card { padding: 20px; border-radius: 12px; }
  .match-head { gap: 12px; }
  .match-index { width: 36px; height: 36px; font-size: 12px; }
  .match h2 { font-size: 19px; }
  .theme-toggle { top: 12px; right: 12px; padding: 7px 10px; }
}
@media print {
  .sidebar, .theme-toggle, .skip { display: none; }
  .layout { display: block; max-width: none; padding: 0; }
  body { background: #fff; color: #000; }
  .card { border-color: #ccc; box-shadow: none; break-inside: avoid; }
  .match { break-inside: auto; }
  .gaps { background: #f7f7f7; }
  a { color: #000; }
  details:not([open]) > *:not(summary) { display: block; }
  details > summary::after { content: ""; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
`;

function renderSummary(report, firstMatchByCategory) {
  if (!report.matches.length) {
    return '<p class="empty">在本次检查范围内，暂无证据充分的匹配点。</p>';
  }
  return report.summary
    .map(({ category, titles }) => {
      const anchor = firstMatchByCategory.get(category);
      return `<a class="summary-item" href="#match-${anchor}"><strong>${escapeHtml(category)}</strong><span>${escapeHtml(titles.join("、"))}</span></a>`;
    })
    .join("\n");
}

function renderEvidence(evidence) {
  return evidence
    .map((citation) => {
      return `<li><a href="../${escapeHtml(citation.href)}"><code>${escapeHtml(citation.path)}</code></a><span class="lines">${citationLine(citation)}</span></li>`;
    })
    .join("\n");
}

function renderQuestions(questions) {
  if (!questions.length) return "";
  return `<section class="block">
<h3>面试追问与答题要点</h3>
${questions
  .map(
    (entry, index) => `<details class="qa">
<summary><span class="q-index">Q${index + 1}</span><span class="q-text">${renderInline(entry.question)}</span></summary>
<div class="qa-answer">${renderRichText(entry.answer)}</div>
</details>`,
  )
  .join("\n")}
</section>`;
}

function renderMatch(match, index) {
  const analysis = match.analysis
    ? `<section class="block"><h3>执行流程</h3>${renderRichText(match.analysis.flow)}</section>
<section class="block"><h3>设计取舍</h3>${renderRichText(match.analysis.tradeoffs)}</section>
<section class="block"><h3>适用边界</h3>${renderRichText(match.analysis.limits)}</section>
`
    : "";
  return `<article class="card match" id="match-${index + 1}">
<div class="match-head">
<span class="match-index">${String(index + 1).padStart(2, "0")}</span>
<div><span class="badge">${escapeHtml(match.category)}</span><h2>${escapeHtml(match.title)}</h2></div>
</div>
<p class="requirement"><span class="label">对应岗位要求</span>${renderInline(match.requirement).replaceAll("\n", "<br>")}</p>
<section class="block"><h3>项目做法</h3>${renderRichText(match.finding)}</section>
${analysis}<section class="block"><h3>源码证据</h3><ul class="evidence">${renderEvidence(match.evidence)}</ul></section>
<section class="block"><h3>面试讲法</h3>${renderRichText(match.interview)}</section>
${renderQuestions(match.questions)}
</article>`;
}

export function renderReportHtml(report) {
  const citations = report.matches.reduce((total, match) => total + match.evidence.length, 0);
  const firstMatchByCategory = new Map();
  report.matches.forEach((match, index) => {
    if (!firstMatchByCategory.has(match.category)) {
      firstMatchByCategory.set(match.category, index + 1);
    }
  });
  const toc = report.matches
    .map(
      (match, index) =>
        `<a href="#match-${index + 1}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(match.title)}</a>`,
    )
    .join("\n");
  const facts = [
    ["判断依据", report.basis],
    ["检查范围", report.scope],
    ...(report.revision ? [["版本", report.revision]] : []),
  ]
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${renderRichText(value)}</dd></div>`)
    .join("\n");
  const matches = report.matches.map(renderMatch).join("\n");
  const gaps = report.gaps.length
    ? `<section class="gaps" id="gaps">
<h2>待核实事项</h2>
<ul>${report.gaps.map((gap) => `<li>${renderRichText(gap)}</li>`).join("")}</ul>
</section>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(report.role)} · 项目源码匹配报告</title>
<script>
try {
  const theme = localStorage.getItem("${themeStorageKey}");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch {}
</script>
<style>${styles}</style>
</head>
<body>
<a class="skip" href="#main">跳到正文</a>
<div class="layout">
<aside class="sidebar">
<p class="brand">project-role-match</p>
<nav aria-label="报告目录">
<a href="#overview"><span>00</span>岗位匹配总览</a>
${toc}
${gaps ? '<a href="#gaps"><span>--</span>待核实事项</a>' : ""}
</nav>
<p class="sidebar-note">${report.matches.length} 个匹配点<br>${citations} 条源码引用</p>
</aside>
<main id="main">
<header class="hero">
<p class="eyebrow">项目源码匹配报告</p>
<h1>${escapeHtml(report.role)}</h1>
<p class="hero-sub">基于源码证据的岗位匹配与面试准备报告</p>
</header>
<section class="card overview" id="overview">
<div class="overview-head">
<h2>岗位匹配总览</h2>
<div class="stats"><span><strong>${report.matches.length}</strong>匹配点</span><span><strong>${citations}</strong>条源码引用</span><span><strong>${report.gaps.length}</strong>项待核实</span></div>
</div>
<dl class="facts">
${facts}
</dl>
<div class="summary">
${renderSummary(report, firstMatchByCategory)}
</div>
</section>
${report.matches.length ? `<h2 class="details-heading">知识点详解</h2>\n${matches}` : ""}
${gaps}
<footer class="footer">由 project-role-match 生成 · 源码链接相对于本报告所在目录</footer>
</main>
</div>
<button class="theme-toggle" id="theme-toggle" type="button" aria-label="切换主题"><span class="dot" aria-hidden="true"></span><span id="theme-label">深色</span></button>
<script>
(() => {
  const root = document.documentElement;
  const button = document.getElementById("theme-toggle");
  const label = document.getElementById("theme-label");
  const current = () => root.dataset.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const sync = () => {
    const dark = current() === "dark";
    label.textContent = dark ? "浅色" : "深色";
    button.setAttribute("aria-label", dark ? "切换到浅色主题" : "切换到深色主题");
  };
  button.addEventListener("click", () => {
    const next = current() === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("${themeStorageKey}", next); } catch {}
    sync();
  });
  sync();
})();
</script>
</body>
</html>
`;
}
