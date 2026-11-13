import { execFileSync, execSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const packageUrl = new URL("../package.json", import.meta.url);
const versionUrl = new URL("../project-role-match/bin/version.mjs", import.meta.url);
const changelogUrl = new URL("../CHANGELOG.md", import.meta.url);

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid version: ${value}. Use x.y.z, patch, minor or major.`);
  }
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function resolveVersion(current, input) {
  const currentParts = parseVersion(current);
  let nextParts;
  if (input === "major") {
    nextParts = [currentParts[0] + 1, 0, 0];
  } else if (input === "minor") {
    nextParts = [currentParts[0], currentParts[1] + 1, 0];
  } else if (input === "patch") {
    nextParts = [currentParts[0], currentParts[1], currentParts[2] + 1];
  } else {
    nextParts = parseVersion(input.replace(/^v/, ""));
  }
  const target = nextParts.join(".");
  if (compareVersions(nextParts, currentParts) <= 0) {
    throw new Error(`New version ${target} must be greater than current ${current}.`);
  }
  return target;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addChangelogEntry(existing, version) {
  const date = new Intl.DateTimeFormat("sv-SE").format(new Date());
  const entry = `## [${version}] - ${date}\n\n### Changed\n\n- TODO: describe the release.\n\n`;
  if (existing === null) {
    return `# Changelog\n\nAll notable changes to this project are documented in this file.\n\n${entry}`;
  }
  if (new RegExp(`^## \\[${escapeRegExp(version)}\\]`, "m").test(existing)) {
    throw new Error(`CHANGELOG.md already contains version ${version}.`);
  }
  const headingIndex = existing.search(/^## \[/m);
  if (headingIndex === -1) {
    return `${existing.replace(/\s*$/, "")}\n\n${entry}`;
  }
  return `${existing.slice(0, headingIndex)}${entry}${existing.slice(headingIndex)}`;
}

async function readOptional(url) {
  try {
    return await readFile(url, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function restore(originals) {
  await writeFile(packageUrl, originals.package, "utf8");
  await writeFile(versionUrl, originals.version, "utf8");
  if (originals.changelog === null) {
    await rm(changelogUrl, { force: true });
  } else {
    await writeFile(changelogUrl, originals.changelog, "utf8");
  }
}

async function main() {
  const input = process.argv[2]?.trim();
  if (!input) {
    throw new Error("Usage: npm run release:prepare -- <patch|minor|major|x.y.z>");
  }
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (status) {
    throw new Error("Working tree is not clean. Commit or stash changes before preparing a release.");
  }

  const packageText = await readFile(packageUrl, "utf8");
  const packageJson = JSON.parse(packageText);
  const versionText = await readFile(versionUrl, "utf8");
  const changelog = await readOptional(changelogUrl);
  const target = resolveVersion(packageJson.version, input);
  const originals = { package: packageText, version: versionText, changelog };

  try {
    await writeFile(
      packageUrl,
      `${JSON.stringify({ ...packageJson, version: target }, null, 2)}\n`,
      "utf8",
    );
    const versionPattern = /export const fallbackToolVersion = "[^"]+";/;
    if (!versionPattern.test(versionText)) {
      throw new Error("Could not find fallbackToolVersion in version.mjs.");
    }
    await writeFile(
      versionUrl,
      versionText.replace(
        versionPattern,
        `export const fallbackToolVersion = "${target}";`,
      ),
      "utf8",
    );
    await writeFile(changelogUrl, addChangelogEntry(changelog, target), "utf8");
    execSync("npm test", { cwd: root, stdio: "inherit" });
  } catch (error) {
    await restore(originals);
    throw error;
  }

  console.log(`\nPrepared v${target}.`);
  console.log("  - package.json");
  console.log("  - project-role-match/bin/version.mjs");
  console.log("  - CHANGELOG.md");
  console.log("\nReview CHANGELOG.md, then:");
  console.log("  git add package.json project-role-match/bin/version.mjs CHANGELOG.md");
  console.log(`  git commit -m "chore: release v${target}"`);
  console.log(`  git tag v${target}`);
  console.log("  git push && git push --tags");
}

main().catch((error) => {
  console.error(`release:prepare: ${error.message}`);
  process.exitCode = 1;
});
