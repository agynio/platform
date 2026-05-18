import type { RenderableTreeNode } from "@markdoc/markdoc";

export type Frontmatter = {
  title: string;
  description?: string;
  order?: number;
};

export type DocRoute = {
  slug: string[];
  href: string;
  sourcePath: string;
  frontmatter: Frontmatter;
};

export type DocPage = DocRoute & {
  content: RenderableTreeNode;
};

export type NavItem = {
  title: string;
  href: string;
  order: number;
  children: NavItem[];
};

export type MetaFile = {
  title?: string;
  order?: number;
  pages?: string[];
};
