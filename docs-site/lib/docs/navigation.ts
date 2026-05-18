import "server-only";

import path from "node:path";
import { DOCS_ROOT } from "./paths";
import { readMetaFile } from "./files";
import { getAllDocRoutes } from "./pages";
import type { DocRoute, NavItem } from "./types";

type NavNode = {
  item: NavItem;
  segment: string;
  children: Map<string, NavNode>;
};

export async function getNavigation(): Promise<NavItem[]> {
  const routes = await getAllDocRoutes();
  const rootNodes = new Map<string, NavNode>();

  for (const route of routes) {
    insertRoute(rootNodes, route);
  }

  await applyDirectoryMetadata(rootNodes, DOCS_ROOT);

  return sortNodes(rootNodes).map((node) => node.item);
}

function insertRoute(rootNodes: Map<string, NavNode>, route: DocRoute) {
  if (route.slug.length === 0) {
    rootNodes.set("index", createNode("index", route.frontmatter.title, route.href, route.frontmatter.order));
    return;
  }

  let currentNodes = rootNodes;

  route.slug.forEach((segment, index) => {
    const existingNode = currentNodes.get(segment);
    const isLeaf = index === route.slug.length - 1;
    const node = existingNode ?? createNode(segment, titleFromSegment(segment), `/${route.slug.slice(0, index + 1).join("/")}`);

    if (isLeaf) {
      node.item.title = route.frontmatter.title;
      node.item.href = route.href;
      node.item.order = route.frontmatter.order ?? node.item.order;
    }

    currentNodes.set(segment, node);
    currentNodes = node.children;
  });
}

function createNode(segment: string, title: string, href: string, order = Number.MAX_SAFE_INTEGER): NavNode {
  return {
    segment,
    item: {
      title,
      href,
      order,
      children: [],
    },
    children: new Map(),
  };
}

async function applyDirectoryMetadata(nodes: Map<string, NavNode>, directory: string) {
  const meta = await readMetaFile(directory);

  if (meta?.pages) {
    meta.pages.forEach((page, index) => {
      const node = nodes.get(page);

      if (node) {
        node.item.order = index;
      }
    });
  }

  for (const node of nodes.values()) {
    const childDirectory = path.join(directory, node.segment);
    const childMeta = await readMetaFile(childDirectory);

    if (childMeta?.title) {
      node.item.title = childMeta.title;
    }

    if (childMeta?.order !== undefined) {
      node.item.order = childMeta.order;
    }

    await applyDirectoryMetadata(node.children, childDirectory);
  }
}

function sortNodes(nodes: Map<string, NavNode>): NavNode[] {
  return Array.from(nodes.values())
    .sort((first, second) => {
      if (first.item.order !== second.item.order) {
        return first.item.order - second.item.order;
      }

      return first.item.title.localeCompare(second.item.title);
    })
    .map((node) => {
      node.item.children = sortNodes(node.children).map((childNode) => childNode.item);
      return node;
    });
}

function titleFromSegment(segment: string): string {
  return segment
    .split("-")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
