import Markdoc, { Tag } from "@markdoc/markdoc";
import type { Config, Node, RenderableTreeNode, RenderableTreeNodes } from "@markdoc/markdoc";
import { rewriteRelativeDocHref } from "./links";
import type { Heading } from "./types";

const config: Config = {
  nodes: {
    fence: {
      render: "CodeBlock",
      attributes: {
        content: { type: String, render: false, required: true },
        language: { type: String },
      },
      transform(node: Node) {
        const content = node.children
          .filter((child) => child.type === "text")
          .map((child) => String((child.attributes as { content?: unknown }).content ?? ""))
          .join("");
        const language = String(
          (node.attributes as { language?: unknown }).language ?? "",
        ).trim();

        if (language === "mermaid") {
          return new Tag("Mermaid", { chart: content });
        }

        return new Tag("CodeBlock", { content, language });
      },
    },
  },
};

export type TransformResult = {
  content: RenderableTreeNodes;
  headings: Heading[];
};

export function transformMarkdoc(content: string, sourcePath: string): TransformResult {
  const ast = Markdoc.parse(content);
  const errors = Markdoc.validate(ast, config);

  if (errors.length > 0) {
    const renderedErrors = errors
      .map((error) => `${error.error.message} at ${sourcePath}`)
      .join("\n");
    throw new Error(renderedErrors);
  }

  const tree = rewriteLinkHrefs(Markdoc.transform(ast, config), sourcePath);
  const headings = collectHeadings(tree);

  return { content: tree, headings };
}

function rewriteLinkHrefs(node: RenderableTreeNodes, sourcePath: string): RenderableTreeNodes {
  if (Array.isArray(node)) {
    return node.map((child) => rewriteLinkHref(child, sourcePath));
  }

  return rewriteLinkHref(node, sourcePath);
}

function rewriteLinkHref(node: RenderableTreeNode, sourcePath: string): RenderableTreeNode {
  if (!Tag.isTag(node)) {
    return node;
  }

  const attributes =
    node.name === "a" && typeof node.attributes.href === "string"
      ? {
          ...node.attributes,
          href: rewriteRelativeDocHref(node.attributes.href, sourcePath),
        }
      : node.attributes;

  return new Tag(
    node.name,
    attributes,
    node.children.map((child) => rewriteLinkHref(child, sourcePath)),
  );
}

const HEADING_LEVELS = new Set([2, 3]);

function collectHeadings(tree: RenderableTreeNodes): Heading[] {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();

  function visit(node: RenderableTreeNode) {
    if (!Tag.isTag(node)) {
      return;
    }

    const match = /^h([1-6])$/.exec(node.name);
    if (match) {
      const level = Number(match[1]);
      if (HEADING_LEVELS.has(level)) {
        const text = extractText(node.children);
        if (text) {
          const base = slugify(text);
          const count = seen.get(base) ?? 0;
          const id = count === 0 ? base : `${base}-${count + 1}`;
          seen.set(base, count + 1);
          node.attributes = { ...node.attributes, id };
          headings.push({ id, text, level });
        }
      }
    }

    for (const child of node.children) {
      visit(child);
    }
  }

  if (Array.isArray(tree)) {
    for (const child of tree) {
      visit(child);
    }
  } else {
    visit(tree);
  }

  return headings;
}

function extractText(nodes: RenderableTreeNode[]): string {
  return nodes.map(textOf).join("").trim();
}

function textOf(node: RenderableTreeNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Tag.isTag(node)) return node.children.map(textOf).join("");
  return "";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
