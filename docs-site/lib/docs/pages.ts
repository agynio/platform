import "server-only";

import { promises as fs } from "node:fs";
import { findDocFiles, slugToHref, slugToSourceCandidates, sourcePathToSlug } from "./files";
import { parseDocument } from "./frontmatter";
import { validateNoRootRelativeLinks } from "./links";
import { transformMarkdoc } from "./markdoc";
import type { DocPage, DocRoute } from "./types";

export async function getAllDocRoutes(): Promise<DocRoute[]> {
  const sourcePaths = await findDocFiles();
  const routes = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const rawDocument = await fs.readFile(sourcePath, "utf8");
      validateNoRootRelativeLinks(rawDocument, sourcePath);
      const { frontmatter } = parseDocument(rawDocument, sourcePath);
      const slug = sourcePathToSlug(sourcePath);

      return {
        slug,
        href: slugToHref(slug),
        sourcePath,
        frontmatter,
      };
    }),
  );

  return routes.sort((first, second) => first.href.localeCompare(second.href));
}

export async function getDocPage(slug: string[]): Promise<DocPage | null> {
  const sourcePath = await findSourcePath(slug);

  if (!sourcePath) {
    return null;
  }

  const rawDocument = await fs.readFile(sourcePath, "utf8");
  validateNoRootRelativeLinks(rawDocument, sourcePath);
  const { content, frontmatter } = parseDocument(rawDocument, sourcePath);

  return {
    slug,
    href: slugToHref(slug),
    sourcePath,
    frontmatter,
    content: transformMarkdoc(content, sourcePath),
  };
}

async function findSourcePath(slug: string[]): Promise<string | null> {
  for (const sourcePath of slugToSourceCandidates(slug)) {
    try {
      const stat = await fs.stat(sourcePath);

      if (stat.isFile()) {
        return sourcePath;
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  return null;
}
