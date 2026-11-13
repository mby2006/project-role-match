import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fallbackToolVersion } from "../project-role-match/bin/version.mjs";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

test("skill fallback version matches package.json", () => {
  assert.equal(fallbackToolVersion, packageJson.version);
});

test("package license matches the repository license", async () => {
  assert.equal(packageJson.license, "MIT");
  const license = await readFile(new URL("../LICENSE", import.meta.url), "utf8");
  assert.match(license, /^MIT License\n/);
  assert.match(license, /Copyright \(c\) 2026 mby/);
});
