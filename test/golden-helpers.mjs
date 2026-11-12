import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const skill = fileURLToPath(new URL("../project-role-match/", import.meta.url));
const cli = join(skill, "bin", "project-role-match.mjs");

export const goldenDir = fileURLToPath(new URL("./golden/", import.meta.url));
export const goldenExamples = [
  { name: "booking", project: "booking", input: "booking-report.json" },
  { name: "search", project: "search", input: "search-report.json" },
  { name: "rag", project: "rag", input: "rag-report.json" },
];

export async function renderExampleWorkspace(example) {
  const exampleDir = fileURLToPath(
    new URL(`../examples/${example.project}/`, import.meta.url),
  );
  const inputPath = fileURLToPath(
    new URL(`../examples/${example.input}`, import.meta.url),
  );
  const parent = await realpath(tmpdir());
  const folder = await mkdtemp(join(parent, `project-role-match-golden-${example.name}-`));
  const root = join(folder, "project");
  await cp(exampleDir, root, {
    recursive: true,
    filter: (source) => !source.split(sep).includes(".project-role-match"),
  });
  try {
    const { stdout } = await run(process.execPath, [
      cli,
      "write",
      "--root",
      root,
      "--input",
      inputPath,
      "--quality",
      "strict",
    ]);
    const written = JSON.parse(stdout);
    return {
      written,
      markdown: await readFile(written.path, "utf8"),
      html: await readFile(written.htmlPath, "utf8"),
      receipt: normalizeReceipt(JSON.parse(await readFile(written.receiptPath, "utf8"))),
      cleanup: () => rm(folder, { recursive: true }),
    };
  } catch (error) {
    await rm(folder, { recursive: true }).catch(() => {});
    throw error;
  }
}

export function normalizeReceipt(receipt) {
  const normalized = structuredClone(receipt);
  normalized.tool.version = "<version>";
  normalized.generatedAt = "<generatedAt>";
  for (const artifact of Object.values(normalized.artifacts ?? {})) {
    if (typeof artifact?.path === "string") {
      artifact.path = artifact.path.replace(/\d{4}-\d{2}-\d{2}-/g, "<date>-");
    }
  }
  return normalized;
}

export function assertGolden(actual, expected, name) {
  if (actual === expected) return;
  const actualLines = actual.split("\n");
  const expectedLines = expected.split("\n");
  let index = 0;
  while (
    index < actualLines.length &&
    index < expectedLines.length &&
    actualLines[index] === expectedLines[index]
  ) {
    index += 1;
  }
  assert.fail(
    [
      `${name} differs from golden at line ${index + 1}.`,
      `expected: ${JSON.stringify(expectedLines[index] ?? "<end of file>")}`,
      `actual:   ${JSON.stringify(actualLines[index] ?? "<end of file>")}`,
      "Run npm run test:update-golden to refresh.",
    ].join("\n"),
  );
}
