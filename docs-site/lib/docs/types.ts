import type { RenderableTreeNodes } from "@markdoc/markdoc";

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
  content: RenderableTreeNodes;
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
