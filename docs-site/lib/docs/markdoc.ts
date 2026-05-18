import Markdoc, { Tag } from "@markdoc/markdoc";
import type { RenderableTreeNode, RenderableTreeNodes } from "@markdoc/markdoc";
import { rewriteRelativeDocHref } from "./links";

export function transformMarkdoc(content: string, sourcePath: string) {
  const ast = Markdoc.parse(content);
  const errors = Markdoc.validate(ast);

  if (errors.length > 0) {
    const renderedErrors = errors
      .map((error) => `${error.error.message} at ${sourcePath}`)
      .join("\n");
    throw new Error(renderedErrors);
  }

  return rewriteLinkHrefs(Markdoc.transform(ast), sourcePath);
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
