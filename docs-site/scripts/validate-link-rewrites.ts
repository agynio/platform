import assert from "node:assert/strict";
import path from "node:path";
import { rewriteRelativeDocHref } from "../lib/docs/links";
import { DOCS_ROOT } from "../lib/docs/paths";

const rootReadme = path.join(DOCS_ROOT, "README.md");
const deployReadme = path.join(DOCS_ROOT, "deploy", "README.md");

const rewriteCases: Array<[string, string, string]> = [
  ["deploy/README.md", rootReadme, "/deploy"],
  ["deploy/", rootReadme, "/deploy"],
  ["README.md", deployReadme, "/deploy"],
  ["../README.md", deployReadme, "/"],
  ["./quick-bootstrap.md", deployReadme, "/deploy/quick-bootstrap"],
  ["quick-bootstrap.md#steps", deployReadme, "/deploy/quick-bootstrap#steps"],
  ["quick-bootstrap.md?view=full", deployReadme, "/deploy/quick-bootstrap?view=full"],
];

for (const [href, sourcePath, expectedHref] of rewriteCases) {
  assert.equal(rewriteRelativeDocHref(href, sourcePath), expectedHref);
}

const passthroughCases = [
  "https://agyn.io",
  "http://agyn.io",
  "mailto:hello@agyn.io",
  "#start-here",
  "/deploy",
  "agyn-tour.webp",
];

for (const href of passthroughCases) {
  assert.equal(rewriteRelativeDocHref(href, rootReadme), href);
}

console.log(`Validated ${rewriteCases.length} link rewrite cases`);
