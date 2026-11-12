import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  assertGolden,
  goldenDir,
  goldenExamples,
  renderExampleWorkspace,
} from "./golden-helpers.mjs";

for (const example of goldenExamples) {
  test(`golden ${example.name} outputs stay stable`, async (t) => {
    const rendered = await renderExampleWorkspace(example);
    t.after(rendered.cleanup);

    assertGolden(
      rendered.markdown,
      await readFile(join(goldenDir, `${example.name}.md`), "utf8"),
      `${example.name} Markdown`,
    );
    assertGolden(
      rendered.html,
      await readFile(join(goldenDir, `${example.name}.html`), "utf8"),
      `${example.name} HTML`,
    );
    assert.deepEqual(
      rendered.receipt,
      JSON.parse(await readFile(join(goldenDir, `${example.name}.receipt.json`), "utf8")),
      `${example.name} receipt differs from golden. Run npm run test:update-golden to refresh.`,
    );
  });
}
