import matter from "gray-matter";
import type { Frontmatter } from "./types";

type RawFrontmatter = {
  title?: unknown;
  description?: unknown;
  order?: unknown;
};

export function parseDocument(rawDocument: string, sourcePath: string) {
  const parsed = matter(rawDocument);
  const frontmatter = parseFrontmatter(parsed.data, sourcePath);

  return {
    content: parsed.content,
    frontmatter,
  };
}

function parseFrontmatter(rawFrontmatter: RawFrontmatter, sourcePath: string): Frontmatter {
  if (typeof rawFrontmatter.title !== "string" || rawFrontmatter.title.trim() === "") {
    throw new Error(`${sourcePath} must define frontmatter title`);
  }

  if (
    rawFrontmatter.description !== undefined &&
    typeof rawFrontmatter.description !== "string"
  ) {
    throw new Error(`${sourcePath} frontmatter description must be a string`);
  }

  if (rawFrontmatter.order !== undefined && typeof rawFrontmatter.order !== "number") {
    throw new Error(`${sourcePath} frontmatter order must be a number`);
  }

  return {
    title: rawFrontmatter.title,
    description: rawFrontmatter.description,
    order: rawFrontmatter.order,
  };
}
