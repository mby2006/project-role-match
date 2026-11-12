import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { goldenDir, goldenExamples, renderExampleWorkspace } from "../test/golden-helpers.mjs";

await mkdir(goldenDir, { recursive: true });
for (const example of goldenExamples) {
  const rendered = await renderExampleWorkspace(example);
  try {
    await writeFile(join(goldenDir, `${example.name}.md`), rendered.markdown, "utf8");
    await writeFile(join(goldenDir, `${example.name}.html`), rendered.html, "utf8");
    await writeFile(
      join(goldenDir, `${example.name}.receipt.json`),
      `${JSON.stringify(rendered.receipt, null, 2)}\n`,
      "utf8",
    );
    console.log(`Updated ${example.name} golden files.`);
  } finally {
    await rendered.cleanup();
  }
}
