import assert from "node:assert/strict";
import path from "node:path";
import { rewriteRelativeDocHref } from "../lib/docs/links";
import { DOCS_ROOT } from "../lib/docs/paths";

const rootReadme = path.join(DOCS_ROOT, "README.md");
const startReadme = path.join(DOCS_ROOT, "start", "README.md");

const rewriteCases: Array<[string, string, string]> = [
  ["start/README.md", rootReadme, "/start"],
  ["start/", rootReadme, "/start"],
  ["README.md", startReadme, "/start"],
  ["../README.md", startReadme, "/"],
  ["./deploy-your-first-agent.md", startReadme, "/start/deploy-your-first-agent"],
  ["deploy-your-first-agent.md#deploy", startReadme, "/start/deploy-your-first-agent#deploy"],
  ["deploy-your-first-agent.md?view=full", startReadme, "/start/deploy-your-first-agent?view=full"],
];

for (const [href, sourcePath, expectedHref] of rewriteCases) {
  assert.equal(rewriteRelativeDocHref(href, sourcePath), expectedHref);
}

const passthroughCases = [
  "https://agyn.io",
  "http://agyn.io",
  "mailto:hello@agyn.io",
  "#start-here",
  "/start",
  "agyn-tour.webp",
];

for (const href of passthroughCases) {
  assert.equal(rewriteRelativeDocHref(href, rootReadme), href);
}

console.log(`Validated ${rewriteCases.length} link rewrite cases`);
