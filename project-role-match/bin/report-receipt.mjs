import { createHash } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";

export const receiptSchema = "project-role-match.receipt/1";

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function artifactRecord(root, path, content) {
  return {
    path: relative(root, path).split(sep).join("/"),
    sha256: sha256(content),
    bytes: Buffer.byteLength(content, "utf8"),
  };
}

export function buildReceipt({ root, report, toolVersion, paths }) {
  const questions = report.reportData.matches.reduce(
    (total, match) => total + match.questions.length,
    0,
  );
  return {
    schema: receiptSchema,
    tool: { name: "project-role-match", version: toolVersion },
    generatedAt: new Date().toISOString(),
    ok: true,
    role: report.role,
    basis: report.reportData.basis,
    scope: report.reportData.scope,
    revision: report.reportData.revision,
    declaredCoverage: report.coverage ?? null,
    summary: {
      matches: report.matches,
      citations: report.citations,
      questions,
      categories: report.reportData.summary.map(({ category }) => category),
      gaps: report.reportData.gaps.length,
    },
    quality: {
      profile: report.quality.profile,
      ok: report.quality.ok,
      gates: report.quality.gates,
      errors: report.quality.errors,
      warnings: report.quality.warnings,
    },
    artifacts: {
      markdown: artifactRecord(root, paths.markdownPath, report.markdown),
      html: artifactRecord(root, paths.htmlPath, report.html),
    },
  };
}

function validArtifactPath(path) {
  if (typeof path !== "string" || !path || /[\\:\u0000-\u001F]/.test(path)) return false;
  return path.split("/").every(
    (segment) =>
      segment && segment !== "." && segment !== ".." && segment.toLowerCase() !== ".git",
  );
}

async function verifyArtifact(root, kind, artifact, issues) {
  const label = `${kind} artifact`;
  if (!artifact || typeof artifact !== "object") {
    issues.push(`${label} is missing from the receipt.`);
    return { status: "invalid" };
  }
  const { path, sha256: expectedSha256, bytes: expectedBytes } = artifact;
  if (!validArtifactPath(path)) {
    issues.push(`${label} has an invalid project-relative path: ${JSON.stringify(path)}`);
    return { path, status: "invalid" };
  }
  if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(expectedSha256)) {
    issues.push(`${label} has an invalid sha256: ${JSON.stringify(expectedSha256)}`);
  }
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0) {
    issues.push(`${label} has an invalid byte count: ${JSON.stringify(expectedBytes)}`);
  }

  let resolved;
  try {
    resolved = await realpath(join(root, path));
  } catch (error) {
    if (error.code === "ENOENT") {
      issues.push(`${label} does not exist: ${path}`);
      return { path, status: "missing", expectedSha256, expectedBytes };
    }
    throw error;
  }
  const resolvedPath = relative(root, resolved).split(sep).join("/");
  if (isAbsolute(resolvedPath) || !validArtifactPath(resolvedPath)) {
    issues.push(`${label} is outside the permitted project paths: ${path}`);
    return { path, status: "outside", expectedSha256, expectedBytes };
  }
  if (!(await stat(resolved)).isFile()) {
    issues.push(`${label} is not a file: ${path}`);
    return { path, status: "invalid", expectedSha256, expectedBytes };
  }

  const content = await readFile(resolved);
  const actualSha256 = sha256(content);
  const actualBytes = content.byteLength;
  if (actualSha256 !== expectedSha256?.toLowerCase()) {
    issues.push(`Artifact hash mismatch for ${path}: expected ${expectedSha256}, got ${actualSha256}`);
  }
  if (actualBytes !== expectedBytes) {
    issues.push(
      `Artifact size mismatch for ${path}: expected ${expectedBytes} bytes, got ${actualBytes}`,
    );
  }
  return {
    path,
    status:
      actualSha256 === expectedSha256?.toLowerCase() && actualBytes === expectedBytes
        ? "match"
        : "mismatch",
    expectedSha256,
    actualSha256,
    expectedBytes,
    actualBytes,
  };
}

export async function verifyReceipt({ root, receipt }) {
  if (receipt?.schema !== receiptSchema) {
    throw new Error(`Unsupported receipt schema: ${JSON.stringify(receipt?.schema)}`);
  }
  const issues = [];
  if (receipt.ok !== true) issues.push("Receipt does not record a successful write.");
  if (receipt.quality?.ok !== true) issues.push("Receipt quality gate is not passing.");

  const artifacts = {};
  for (const kind of ["markdown", "html"]) {
    artifacts[kind] = await verifyArtifact(root, kind, receipt.artifacts?.[kind], issues);
  }

  if (issues.length) {
    throw new Error(["Receipt verification failed:", ...issues.map((issue) => `- ${issue}`)].join("\n"));
  }
  return {
    ok: true,
    quality: receipt.quality,
    summary: receipt.summary,
    artifacts,
  };
}
