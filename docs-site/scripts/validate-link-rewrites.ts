import assert from "node:assert/strict";
import path from "node:path";
import { rewriteRelativeDocHref } from "../lib/docs/links";
import { DOCS_ROOT } from "../lib/docs/paths";

const rootReadme = path.join(DOCS_ROOT, "README.md");
const gettingStartedReadme = path.join(DOCS_ROOT, "getting-started", "README.md");

const rewriteCases: Array<[string, string, string]> = [
  ["getting-started/README.md", rootReadme, "/getting-started"],
  ["getting-started/", rootReadme, "/getting-started"],
  ["README.md", gettingStartedReadme, "/getting-started"],
  ["../README.md", gettingStartedReadme, "/"],
  ["./first-agent.md", gettingStartedReadme, "/getting-started/first-agent"],
  ["first-agent.md#deploy", gettingStartedReadme, "/getting-started/first-agent#deploy"],
  ["first-agent.md?view=full", gettingStartedReadme, "/getting-started/first-agent?view=full"],
];

for (const [href, sourcePath, expectedHref] of rewriteCases) {
  assert.equal(rewriteRelativeDocHref(href, sourcePath), expectedHref);
}

const passthroughCases = [
  "https://agyn.io",
  "http://agyn.io",
  "mailto:hello@agyn.io",
  "#start-here",
  "/getting-started",
  "agyn-tour.webp",
];

for (const href of passthroughCases) {
  assert.equal(rewriteRelativeDocHref(href, rootReadme), href);
}

console.log(`Validated ${rewriteCases.length} link rewrite cases`);
