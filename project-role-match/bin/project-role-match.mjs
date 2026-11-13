#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { lstat, mkdir, open, readFile, realpath, stat, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { parseArgs } from "node:util";
import { renderReportHtml } from "./report-html.mjs";
import { evaluateReportQuality } from "./report-quality.mjs";
import { buildReceipt, verifyReceipt } from "./report-receipt.mjs";

const reportDirectory = ".project-role-match";
const excludedDirectories = new Set([reportDirectory, ".git"]);
const fallbackToolVersion = "0.4.0";

const usage = `Usage:
  node project-role-match.mjs doctor
  node project-role-match.mjs check --root <project-root> --input <report.json|-> [--quality standard|strict]
  node project-role-match.mjs write --root <project-root> --input <report.json|-> [--quality standard|strict]
  node project-role-match.mjs verify --root <project-root> --receipt <receipt.json|->`;

function requiredText(value, name, { singleLine = false } = {}) {
  if (typeof value !== "string" || !value.trim() || (singleLine && /[\r\n]/.test(value))) {
    throw new Error(`${name} must be a non-empty ${singleLine ? "single-line " : ""}string.`);
  }
  return value.trim();
}

function requireArray(value, name, min) {
  if (!Array.isArray(value) || value.length < min) {
    throw new Error(`${name} must be an array with at least ${min} item(s).`);
  }
  return value;
}

function normalizeLines(text) {
  return text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function allowedSegments(segments) {
  return segments.every((segment) =>
    segment && segment !== "." && segment !== ".." &&
    !excludedDirectories.has(segment.toLowerCase())
  );
}

async function verifyCitation(citation, root, sources) {
  const path = citation?.path;
  if (typeof path !== "string" || /[\\:\u0000-\u001F]/.test(path) || !allowedSegments(path.split("/"))) {
    throw new Error(`Invalid project-relative source path: ${JSON.stringify(path)}`);
  }
  const { startLine, excerpt } = citation;
  if (!Number.isSafeInteger(startLine) || startLine < 1) {
    throw new Error(`Invalid starting line for ${path}.`);
  }
  requiredText(excerpt, `Excerpt for ${path}`);
  if (!sources.has(path)) {
    const source = await realpath(join(root, path)).catch((error) => {
      if (error.code === "ENOENT") throw new Error(`Source file does not exist: ${path}`);
      throw error;
    });
    const resolvedPath = relative(root, source);
    if (isAbsolute(resolvedPath) || !allowedSegments(resolvedPath.split(sep))) {
      throw new Error(`Source file is outside the permitted project paths: ${path}`);
    }
    if (!(await stat(source)).isFile()) throw new Error(`Source path is not a file: ${path}`);
    sources.set(path, normalizeLines(await readFile(source, "utf8")).split("\n"));
  }
  const expected = normalizeLines(excerpt).split("\n");
  const endLine = startLine + expected.length - 1;
  const actual = sources.get(path).slice(startLine - 1, endLine);
  if (expected.length !== actual.length || expected.some((line, index) => line !== actual[index])) {
    throw new Error(`Source excerpt does not match ${path}:${startLine}–${endLine}.`);
  }
  const href = path.split("/").map((part) =>
    encodeURIComponent(part).replaceAll("(", "%28").replaceAll(")", "%29")
  ).join("/");
  return { path, href, startLine, endLine };
}

function citationLine(citation) {
  return citation.endLine === citation.startLine
    ? `第 ${citation.startLine} 行`
    : `第 ${citation.startLine}–${citation.endLine} 行`;
}

function renderMarkdown(report) {
  const sections = report.matches.map((match, index) => {
    const links = match.evidence.map((citation) => {
      const label = citation.path.replaceAll("[", "\\[").replaceAll("]", "\\]");
      return `- [${label}](../${citation.href})（${citationLine(citation)}）`;
    });
    const analysis = match.analysis
      ? [
          ["执行流程", match.analysis.flow],
          ["设计取舍", match.analysis.tradeoffs],
          ["适用边界", match.analysis.limits],
        ].map(([label, detail]) => `#### ${label}\n\n${detail}`)
      : [];
    const questions = match.questions.map(
      (entry, questionIndex) => `##### ${questionIndex + 1}. ${entry.question}\n\n${entry.answer}`,
    );
    return [
      `### ${index + 1}. ${match.title}`,
      `**领域**　${match.category}\n\n**对应岗位要求**　${match.requirement}`,
      `#### 项目做法\n\n${match.finding}`,
      ...analysis,
      `#### 源码证据\n\n${links.join("\n")}`,
      `#### 面试讲法\n\n${match.interview}`,
      ...(questions.length ? ["#### 面试追问与答题要点", ...questions] : []),
    ].join("\n\n");
  });
  const summary = report.matches.length
    ? report.summary.map(({ category, titles }) => `- **${category}**　${titles.join("、")}`).join("\n")
    : "在本次检查范围内，暂无证据充分的匹配点。";
  const gapItems = report.gaps.map((gap) => `- ${gap.replaceAll("\n", "\n  ")}`);
  return [
    `# ${report.role} · 项目源码匹配报告`,
    "## 岗位匹配总览",
    `**判断依据**　${report.basis}\n\n**检查范围**　${report.scope}`,
    ...(report.revision ? [`**版本**　${report.revision}`] : []),
    summary,
    ...(sections.length ? ["## 知识点详解"] : []),
    ...sections,
    ...(gapItems.length ? [`## 待核实事项\n\n${gapItems.join("\n")}`] : []),
  ].join("\n\n") + "\n";
}

async function buildReport(input, root, profile) {
  const role = requiredText(input?.role, "role", { singleLine: true });
  const basis = requiredText(input.basis, "basis");
  const scope = requiredText(input.scope, "scope");
  const revision = input.revision === undefined ? "" : requiredText(input.revision, "revision");
  const rawMatches = requireArray(input.matches, "matches", 0);
  const gaps = requireArray(input.gaps, "gaps", rawMatches.length ? 0 : 1).map(
    (gap, index) => requiredText(gap, `gaps[${index}]`),
  );
  const coverage = input.coverage === undefined
    ? undefined
    : requireArray(input.coverage, "coverage", 1).map(
        (item, index) => requiredText(item, `coverage[${index}]`, { singleLine: true }),
      );
  if (coverage && new Set(coverage).size !== coverage.length) {
    throw new Error("coverage must not contain duplicate entries.");
  }
  const sources = new Map();
  const topicsByCategory = new Map();
  const matches = [];
  let citations = 0;

  for (const [index, match] of rawMatches.entries()) {
    const field = `matches[${index}]`;
    const title = requiredText(match?.title, `${field}.title`, { singleLine: true });
    const requirement = requiredText(match.requirement, `${field}.requirement`);
    const finding = requiredText(match.finding, `${field}.finding`);
    const interview = requiredText(match.interview, `${field}.interview`);
    const category = match.category === undefined
      ? "项目实现"
      : requiredText(match.category, `${field}.category`, { singleLine: true });
    const analysis = match.analysis === undefined ? null : {
      flow: requiredText(match.analysis?.flow, `${field}.analysis.flow`),
      tradeoffs: requiredText(match.analysis?.tradeoffs, `${field}.analysis.tradeoffs`),
      limits: requiredText(match.analysis?.limits, `${field}.analysis.limits`),
    };
    const questions = requireArray(match.questions ?? [], `${field}.questions`, 0).map(
      (entry, questionIndex) => {
        const questionField = `${field}.questions[${questionIndex}]`;
        return {
          question: requiredText(entry?.question, `${questionField}.question`, { singleLine: true }),
          answer: requiredText(entry.answer, `${questionField}.answer`),
        };
      },
    );
    const evidence = [];
    for (const citation of requireArray(match.evidence, `${field}.evidence`, 1)) {
      evidence.push(await verifyCitation(citation, root, sources));
    }
    citations += evidence.length;
    if (!topicsByCategory.has(category)) topicsByCategory.set(category, []);
    topicsByCategory.get(category).push(title);
    matches.push({ title, category, requirement, finding, analysis, evidence, interview, questions });
  }

  const report = {
    role,
    basis,
    scope,
    revision,
    summary: [...topicsByCategory].map(([category, titles]) => ({ category, titles })),
    matches,
    gaps,
  };
  const quality = evaluateReportQuality({ input, report, coverage, profile });
  if (!quality.ok) {
    throw new Error(
      [`Quality gate failed (${profile}):`, ...quality.errors.map((issue) => `- ${issue}`)].join("\n"),
    );
  }
  quality.gates.unshift({
    id: "citations",
    status: "pass",
    checked: citations,
    total: citations,
    issues: [],
  });
  return {
    role,
    reportData: report,
    coverage,
    markdown: renderMarkdown(report),
    html: renderReportHtml(report),
    matches: matches.length,
    citations,
    quality,
  };
}

async function resolveToolVersion() {
  try {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    );
    return typeof packageJson.version === "string" ? packageJson.version : fallbackToolVersion;
  } catch {
    return fallbackToolVersion;
  }
}

async function saveReport(root, report, toolVersion) {
  const directory = join(root, reportDirectory);
  await mkdir(directory, { recursive: true });
  if (!(await lstat(directory)).isDirectory()) {
    throw new Error(`${reportDirectory} must be a regular directory in the project root.`);
  }
  const date = new Intl.DateTimeFormat("sv-SE").format(new Date());
  const slug = [...report.role.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "")]
    .slice(0, 48).join("") || "report";
  const base = `${date}-${slug}`;

  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? "" : `-${index}`;
    const paths = {
      markdownPath: join(directory, `${base}${suffix}.md`),
      htmlPath: join(directory, `${base}${suffix}.html`),
      receiptPath: join(directory, `${base}${suffix}.receipt.json`),
    };
    const reserved = [];
    try {
      for (const path of Object.values(paths)) {
        reserved.push({ path, file: await open(path, "wx") });
      }
    } catch (error) {
      await Promise.allSettled(reserved.map(({ file }) => file.close()));
      await Promise.allSettled(reserved.map(({ path }) => unlink(path)));
      if (error.code === "EEXIST") continue;
      throw error;
    }
    try {
      const receipt = buildReceipt({ root, report, toolVersion, paths });
      const receiptContent = `${JSON.stringify(receipt, null, 2)}\n`;
      await reserved[0].file.writeFile(report.markdown, "utf8");
      await reserved[1].file.writeFile(report.html, "utf8");
      await reserved[2].file.writeFile(receiptContent, "utf8");
      await Promise.allSettled(reserved.map(({ file }) => file.close()));
      return {
        path: paths.markdownPath,
        htmlPath: paths.htmlPath,
        receiptPath: paths.receiptPath,
        receipt,
      };
    } catch (error) {
      await Promise.allSettled(reserved.map(({ file }) => file.close()));
      await Promise.allSettled(reserved.map(({ path }) => unlink(path)));
      throw error;
    }
  }
}

async function main([command, ...args]) {
  if (!command || command === "--help" || command === "-h") {
    console.log(usage);
    return;
  }
  if (command === "doctor" && args.length === 0) {
    await readFile(new URL("../SKILL.md", import.meta.url));
    await readFile(new URL("../LICENSE", import.meta.url));
    await readFile(new URL("../references/report-input.md", import.meta.url));
    await readFile(new URL("../references/evidence-contract.md", import.meta.url));
    console.log(JSON.stringify({ ok: true, node: process.versions.node }));
    return;
  }
  if (command === "verify") {
    const { values } = parseArgs({
      args,
      options: { root: { type: "string" }, receipt: { type: "string" } },
    });
    if (!values.root || !values.receipt) throw new Error(usage);
    const root = await realpath(values.root);
    if (!(await stat(root)).isDirectory()) throw new Error("--root must point to a project directory.");
    const receiptText = values.receipt === "-"
      ? readFileSync(0, "utf8")
      : await readFile(values.receipt, "utf8").catch((error) => {
          if (error.code === "ENOENT") {
            throw new Error(`Receipt file does not exist: ${values.receipt}`);
          }
          throw error;
        });
    let receipt;
    try {
      receipt = JSON.parse(normalizeLines(receiptText));
    } catch (error) {
      throw new Error(`Receipt is not valid JSON: ${error.message}`);
    }
    const verified = await verifyReceipt({ root, receipt });
    console.log(JSON.stringify({
      ...verified,
      receipt: values.receipt,
      tool: receipt.tool,
      generatedAt: receipt.generatedAt,
    }));
    return;
  }
  if (command !== "check" && command !== "write") throw new Error(usage);
  const { values } = parseArgs({
    args,
    options: {
      root: { type: "string" },
      input: { type: "string" },
      quality: { type: "string" },
    },
  });
  if (!values.root || !values.input) throw new Error(usage);
  const profile = values.quality ?? "standard";
  if (profile !== "standard" && profile !== "strict") {
    throw new Error('--quality must be "standard" or "strict".');
  }
  const root = await realpath(values.root);
  if (!(await stat(root)).isDirectory()) throw new Error("--root must point to a project directory.");
  const json = values.input === "-" ? readFileSync(0, "utf8") : await readFile(values.input, "utf8");
  const report = await buildReport(JSON.parse(normalizeLines(json)), root, profile);
  const saved = command === "write"
    ? await saveReport(root, report, await resolveToolVersion())
    : {};
  console.log(JSON.stringify({
    ok: true,
    path: saved.path,
    htmlPath: saved.htmlPath,
    receiptPath: saved.receiptPath,
    matches: report.matches,
    citations: report.citations,
    quality: report.quality,
  }));
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(`project-role-match: ${error.message}`);
  process.exitCode = 1;
}
