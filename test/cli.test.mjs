import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const run = promisify(execFile);
const skill = fileURLToPath(new URL("../project-role-match/", import.meta.url));
const cli = join(skill, "bin", "project-role-match.mjs");
const example = fileURLToPath(new URL("../examples/booking/", import.meta.url));
const input = fileURLToPath(new URL("../examples/booking-report.json", import.meta.url));

async function workspace(t) {
  const parent = await realpath(tmpdir());
  const folder = await mkdtemp(join(parent, "project-role-match-"));
  t.after(async () => {
    const resolved = await realpath(folder);
    assert.equal(dirname(resolved), parent);
    assert.ok(basename(resolved).startsWith("project-role-match-"));
    await rm(resolved, { recursive: true });
  });
  return folder;
}

function invoke(command, root, manifest = input, entry = cli, args = []) {
  return run(process.execPath, [entry, command, "--root", root, "--input", manifest, ...args]);
}

function verifyCommand(root, receiptPath, entry = cli) {
  return run(process.execPath, [entry, "verify", "--root", root, "--receipt", receiptPath]);
}

async function copyExample(destination) {
  await cp(example, destination, {
    recursive: true,
    filter: (source) => !source.split(sep).includes(".project-role-match"),
  });
}

async function draft(folder, edit) {
  const manifest = JSON.parse(await readFile(input, "utf8"));
  edit(manifest);
  const path = join(folder, "input.json");
  await writeFile(path, JSON.stringify(manifest), "utf8");
  return path;
}

test("the copied skill works from a project-local installation", async (t) => {
  const folder = await workspace(t);
  const root = join(folder, "target project");
  await copyExample(root);
  const installed = join(root, ".claude", "skills", "project-role-match");
  await cp(skill, installed, { recursive: true });
  const entry = join(installed, "bin", "project-role-match.mjs");
  const health = await run(process.execPath, [entry, "doctor"]);
  assert.equal(JSON.parse(health.stdout).ok, true);

  const check = await invoke("check", root, input, entry);
  const checked = JSON.parse(check.stdout);
  assert.equal(checked.ok, true);
  assert.equal(checked.matches, 1);
  assert.equal(checked.citations, 3);
  assert.equal(checked.quality.profile, "standard");
  assert.deepEqual(checked.quality.errors, []);
  assert.deepEqual(checked.quality.warnings, []);
  assert.deepEqual(
    checked.quality.gates.map(({ id, status }) => [id, status]),
    [
      ["citations", "pass"],
      ["structure", "pass"],
      ["questions", "pass"],
      ["coverage", "pass"],
    ],
  );
  const strict = JSON.parse(
    (await invoke("check", root, input, entry, ["--quality", "strict"])).stdout,
  );
  assert.equal(strict.ok, true);
  assert.deepEqual(strict.quality.errors, []);
  await assert.rejects(stat(join(root, ".project-role-match")), { code: "ENOENT" });
  const result = JSON.parse((await invoke("write", root, input, entry)).stdout);
  assert.equal(dirname(result.path), join(root, ".project-role-match"));
  assert.equal(dirname(result.htmlPath), join(root, ".project-role-match"));
  assert.equal(result.path.replace(/\.md$/, ""), result.htmlPath.replace(/\.html$/, ""));
  const content = await readFile(result.path, "utf8");
  assert.match(content, /后端开发 · 项目源码匹配报告/);
  assert.match(content, /\[schema\.sql\]\(\.\.\/schema\.sql\)（第 5 行）/);
  assert.match(content, /第 6–7 行/);
  assert.match(content, /## 岗位匹配总览[\s\S]*数据库与数据一致性[\s\S]*## 知识点详解/);
  assert.match(content, /#### 执行流程[\s\S]*#### 设计取舍[\s\S]*#### 适用边界/);
  assert.match(content, /##### 3\. 如何验证重复请求的行为？[\s\S]*断言最终只有一行/);
  const html = await readFile(result.htmlPath, "utf8");
  assert.match(html, /<title>后端开发 · 项目源码匹配报告<\/title>/);
  assert.match(html, /href="\.\.\/schema\.sql"/);
  assert.match(html, /第 6–7 行/);
  assert.match(html, /<details class="qa">/);
  assert.match(html, /<section class="gaps" id="gaps">/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.equal(dirname(result.receiptPath), join(root, ".project-role-match"));
  assert.equal(result.path.replace(/\.md$/, ""), result.receiptPath.replace(/\.receipt\.json$/, ""));
  const receipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
  assert.equal(receipt.schema, "project-role-match.receipt/1");
  assert.equal(receipt.ok, true);
  assert.equal(typeof receipt.tool.version, "string");
  assert.equal(receipt.role, "后端开发");
  assert.equal(receipt.quality.profile, "standard");
  assert.deepEqual(receipt.quality.errors, []);
  assert.deepEqual(receipt.quality.warnings, []);
  assert.deepEqual(
    receipt.quality.gates.map(({ id, status }) => [id, status]),
    [
      ["citations", "pass"],
      ["structure", "pass"],
      ["questions", "pass"],
      ["coverage", "pass"],
    ],
  );
  assert.equal(receipt.summary.matches, 1);
  assert.equal(receipt.summary.citations, 3);
  assert.equal(receipt.summary.questions, 3);
  assert.deepEqual(receipt.summary.categories, ["数据库与数据一致性"]);
  assert.equal(receipt.summary.gaps, 1);
  assert.equal(receipt.declaredCoverage, null);
  assert.match(receipt.artifacts.markdown.path, /^\.project-role-match\/.+\.md$/);
  assert.match(receipt.artifacts.html.path, /^\.project-role-match\/.+\.html$/);
  assert.equal(
    receipt.artifacts.markdown.sha256,
    createHash("sha256").update(content, "utf8").digest("hex"),
  );
  assert.equal(
    receipt.artifacts.html.sha256,
    createHash("sha256").update(html, "utf8").digest("hex"),
  );
  assert.equal(receipt.artifacts.markdown.bytes, Buffer.byteLength(content, "utf8"));
  assert.equal(receipt.artifacts.html.bytes, Buffer.byteLength(html, "utf8"));
  assert.ok(!Number.isNaN(Date.parse(receipt.generatedAt)));
  const verified = JSON.parse((await verifyCommand(root, result.receiptPath, entry)).stdout);
  assert.equal(verified.ok, true);
  assert.equal(verified.quality.profile, "standard");
  assert.equal(verified.artifacts.markdown.status, "match");
  assert.equal(verified.artifacts.html.status, "match");
  assert.equal(verified.artifacts.markdown.actualSha256, receipt.artifacts.markdown.sha256);
  assert.equal(verified.artifacts.html.actualBytes, receipt.artifacts.html.bytes);
});

test("reports can cover more than five topics and accept older entries", async (t) => {
  const folder = await workspace(t);
  const manifest = await draft(folder, (report) => {
    const { title, requirement, finding, interview, evidence } = report.matches[0];
    report.matches = Array.from({ length: 6 }, (_, index) => ({
      title: `${title} ${index + 1}`, requirement, finding, interview, evidence,
    }));
  });
  const checked = JSON.parse((await invoke("check", example, manifest)).stdout);
  assert.equal(checked.ok, true);
  assert.equal(checked.matches, 6);
  assert.equal(checked.citations, 18);
  assert.equal(checked.quality.profile, "standard");
  assert.deepEqual(checked.quality.errors, []);
  assert.ok(checked.quality.warnings.length >= 6);
  await assert.rejects(
    invoke("check", example, manifest, cli, ["--quality", "strict"]),
    /missing category/,
  );
  const root = join(folder, "project");
  await copyExample(root);
  const result = JSON.parse((await invoke("write", root, manifest)).stdout);
  assert.match(result.htmlPath, /\.html$/);
  assert.doesNotMatch(
    await readFile(result.htmlPath, "utf8"),
    /执行流程|设计取舍|适用边界|<details class="qa">/,
  );
  assert.doesNotMatch(
    await readFile(result.path, "utf8"),
    /#### 执行流程|#### 设计取舍|#### 适用边界/,
  );
});

test("strict quality gate blocks incomplete structures", async (t) => {
  const folder = await workspace(t);
  const root = join(folder, "project");
  await copyExample(root);
  const manifest = await draft(folder, (report) => {
    delete report.matches[0].analysis;
    delete report.matches[0].questions;
  });
  await assert.rejects(
    invoke("write", root, manifest, cli, ["--quality", "strict"]),
    /Quality gate failed \(strict\):[\s\S]*analysis[\s\S]*questions/,
  );
  await assert.rejects(stat(join(root, ".project-role-match")), { code: "ENOENT" });
});

test("strict quality gate requires three interview questions", async (t) => {
  const folder = await workspace(t);
  const manifest = await draft(folder, (report) => {
    report.matches[0].questions = report.matches[0].questions.slice(0, 2);
  });
  await assert.rejects(
    invoke("check", example, manifest, cli, ["--quality", "strict"]),
    /at least 3 required/,
  );
});

test("strict coverage gate accepts declared coverage and rejects uncovered domains", async (t) => {
  const folder = await workspace(t);
  const makeMatches = (report) => {
    const match = report.matches[0];
    report.matches = [1, 2, 3].map((index) => ({
      ...structuredClone(match),
      title: `${match.title} ${index}`,
    }));
    report.gaps = ["示例范围有限。"];
  };

  const manifest = await draft(folder, (report) => {
    makeMatches(report);
  });
  const standard = JSON.parse((await invoke("check", example, manifest)).stdout);
  assert.equal(standard.quality.errors.length, 0);
  assert.match(standard.quality.warnings.join("\n"), /distinct categories/);
  await assert.rejects(
    invoke("check", example, manifest, cli, ["--quality", "strict"]),
    /distinct categories/,
  );

  const narrow = await draft(folder, (report) => {
    makeMatches(report);
    report.coverage = ["数据库与数据一致性"];
  });
  const declared = JSON.parse(
    (await invoke("check", example, narrow, cli, ["--quality", "strict"])).stdout,
  );
  assert.equal(declared.ok, true);
  assert.deepEqual(declared.quality.errors, []);

  const uncovered = await draft(folder, (report) => {
    makeMatches(report);
    report.coverage = ["数据库与数据一致性", "并发与故障处理"];
  });
  await assert.rejects(
    invoke("check", example, uncovered, cli, ["--quality", "strict"]),
    /declared coverage "并发与故障处理"/,
  );
});

test("duplicate match titles are rejected", async (t) => {
  const folder = await workspace(t);
  const manifest = await draft(folder, (report) => {
    report.matches.push(structuredClone(report.matches[0]));
  });
  await assert.rejects(
    invoke("check", example, manifest),
    /duplicates the title of matches\[0\]/,
  );
});

test("unknown quality profiles are rejected", async () => {
  await assert.rejects(
    invoke("check", example, input, cli, ["--quality", "deep"]),
    /--quality must be/,
  );
});

test("a nonexistent payment handler cannot be cited", async (t) => {
  const folder = await workspace(t);
  const manifest = await draft(folder, (report) => {
    report.matches[0].evidence[0].path = "payments/PayController.java";
  });
  await assert.rejects(invoke("write", folder, manifest), /Source file does not exist: payments\/PayController\.java/);
  await assert.rejects(stat(join(folder, ".project-role-match")), { code: "ENOENT" });
});

test("a real file with the wrong excerpt or line number is rejected", async (t) => {
  const folder = await workspace(t);
  const manifest = await draft(folder, (report) => {
    report.matches[0].evidence[1].startLine -= 1;
  });
  await assert.rejects(invoke("check", example, manifest), /Source excerpt does not match bookings\.mjs:5–6/);
});

test("concurrent runs preserve every artifact", async (t) => {
  const folder = await workspace(t);
  await copyExample(folder);
  const results = await Promise.all([invoke("write", folder), invoke("write", folder)]);
  const parsed = results.map(({ stdout }) => JSON.parse(stdout));
  const paths = parsed.map(({ path }) => path);
  const htmlPaths = parsed.map(({ htmlPath }) => htmlPath);
  const receiptPaths = parsed.map(({ receiptPath }) => receiptPath);
  assert.notEqual(paths[0], paths[1]);
  assert.notEqual(htmlPaths[0], htmlPaths[1]);
  assert.notEqual(receiptPaths[0], receiptPaths[1]);
  assert.equal((await readdir(join(folder, ".project-role-match"))).length, 6);
  assert.match(paths.find((path) => path.endsWith("-2.md")) ?? "", /后端开发-2\.md$/);
  assert.match(htmlPaths.find((path) => path.endsWith("-2.html")) ?? "", /后端开发-2\.html$/);
  assert.match(
    receiptPaths.find((path) => path.endsWith("-2.receipt.json")) ?? "",
    /后端开发-2\.receipt\.json$/,
  );
  assert.equal(await readFile(paths[0], "utf8"), await readFile(paths[1], "utf8"));
  assert.equal(await readFile(htmlPaths[0], "utf8"), await readFile(htmlPaths[1], "utf8"));
  const receipts = await Promise.all(
    receiptPaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
  assert.deepEqual(receipts[0].summary, receipts[1].summary);
  assert.deepEqual(receipts[0].quality, receipts[1].quality);
  assert.equal(
    receipts[0].artifacts.markdown.sha256,
    receipts[1].artifacts.markdown.sha256,
  );
  assert.equal(receipts[0].artifacts.html.sha256, receipts[1].artifacts.html.sha256);
});

test("source links cannot escape the target repository", async (t) => {
  const folder = await workspace(t);
  const root = join(folder, "project");
  const outside = join(folder, "outside");
  await copyExample(root);
  await copyExample(outside);
  await symlink(outside, join(root, "linked"), "junction");
  const manifest = await draft(folder, (report) => {
    report.matches[0].evidence[0].path = "linked/bookings.mjs";
  });
  await assert.rejects(invoke("check", root, manifest), /outside the permitted project paths/);
});

test("insufficient evidence can still produce a gap report", async (t) => {
  const folder = await workspace(t);
  const manifest = await draft(folder, (report) => {
    report.matches = [];
    report.gaps = ["暂未找到实际支付入口和回调实现。"];
  });
  const strict = JSON.parse(
    (await invoke("check", folder, manifest, cli, ["--quality", "strict"])).stdout,
  );
  assert.equal(strict.ok, true);
  const result = JSON.parse((await invoke("write", folder, manifest)).stdout);
  assert.equal(result.citations, 0);
  assert.match(await readFile(result.path, "utf8"), /暂无证据充分的匹配点。/);
  assert.match(await readFile(result.htmlPath, "utf8"), /暂无证据充分的匹配点。/);
  const receipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
  assert.equal(receipt.summary.matches, 0);
  assert.equal(receipt.summary.citations, 0);
  assert.equal(receipt.quality.gates[0].id, "citations");
  assert.equal(receipt.quality.gates[0].checked, 0);
});

test("verify detects missing and modified artifacts", async (t) => {
  const folder = await workspace(t);
  await copyExample(folder);
  const written = JSON.parse((await invoke("write", folder)).stdout);
  await rm(written.path);
  await writeFile(written.htmlPath, "changed", "utf8");
  await assert.rejects(
    verifyCommand(folder, written.receiptPath),
    /markdown artifact does not exist[\s\S]*Artifact hash mismatch for .*\.html[\s\S]*Artifact size mismatch/,
  );
});

test("verify rejects artifact paths outside the project", async (t) => {
  const folder = await workspace(t);
  await copyExample(folder);
  const written = JSON.parse((await invoke("write", folder)).stdout);
  const receipt = JSON.parse(await readFile(written.receiptPath, "utf8"));
  receipt.artifacts.markdown.path = "../outside.md";
  await writeFile(written.receiptPath, `${JSON.stringify(receipt)}\n`, "utf8");
  await assert.rejects(
    verifyCommand(folder, written.receiptPath),
    /markdown artifact has an invalid project-relative path/,
  );
});

test("verify rejects unknown receipt schemas", async (t) => {
  const folder = await workspace(t);
  const receiptPath = join(folder, "bad.receipt.json");
  await writeFile(receiptPath, JSON.stringify({ schema: "other/1", ok: true }), "utf8");
  await assert.rejects(verifyCommand(folder, receiptPath), /Unsupported receipt schema/);
});

test("html output escapes report content and stays offline", async (t) => {
  const folder = await workspace(t);
  const root = join(folder, "project");
  await copyExample(root);
  const manifest = await draft(folder, (report) => {
    report.matches[0].finding = '<script>alert("x")</script>';
  });
  const result = JSON.parse((await invoke("write", root, manifest)).stdout);
  const html = await readFile(result.htmlPath, "utf8");
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /https?:\/\//);
});
