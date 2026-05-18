import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { ASSETS_DIRNAME, DOC_EXTENSION, DOCS_ROOT, META_FILENAME } from "./paths";
import type { MetaFile } from "./types";

export async function findDocFiles(directory = DOCS_ROOT): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name === ASSETS_DIRNAME) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findDocFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(DOC_EXTENSION)) {
      files.push(entryPath);
    }
  }

  return files;
}

export function sourcePathToSlug(sourcePath: string): string[] {
  const relativePath = path.relative(DOCS_ROOT, sourcePath);
  const withoutExtension = relativePath.slice(0, -DOC_EXTENSION.length);
  const segments = withoutExtension.split(path.sep);

  if (segments.length === 1 && segments[0] === "index") {
    return [];
  }

  if (segments.at(-1) === "index") {
    return segments.slice(0, -1);
  }

  return segments;
}

export function slugToSourceCandidates(slug: string[]): string[] {
  if (slug.length === 0) {
    return [path.join(DOCS_ROOT, `index${DOC_EXTENSION}`)];
  }

  return [
    path.join(DOCS_ROOT, ...slug, `index${DOC_EXTENSION}`),
    path.join(DOCS_ROOT, `${path.join(...slug)}${DOC_EXTENSION}`),
  ];
}

export function slugToHref(slug: string[]): string {
  return slug.length === 0 ? "/" : `/${slug.join("/")}`;
}

export async function readMetaFile(directory: string): Promise<MetaFile | null> {
  const metaPath = path.join(directory, META_FILENAME);

  try {
    const rawMeta = await fs.readFile(metaPath, "utf8");
    return parseMetaFile(JSON.parse(rawMeta), metaPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

function parseMetaFile(rawMeta: unknown, metaPath: string): MetaFile {
  if (rawMeta === null || typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
    throw new Error(`${metaPath} must contain a JSON object`);
  }

  const meta = rawMeta as MetaFile;

  if (meta.title !== undefined && typeof meta.title !== "string") {
    throw new Error(`${metaPath} title must be a string`);
  }

  if (meta.order !== undefined && typeof meta.order !== "number") {
    throw new Error(`${metaPath} order must be a number`);
  }

  if (
    meta.pages !== undefined &&
    (!Array.isArray(meta.pages) || meta.pages.some((page) => typeof page !== "string"))
  ) {
    throw new Error(`${metaPath} pages must be an array of strings`);
  }

  return meta;
}
