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

export type Heading = {
  id: string;
  text: string;
  level: number;
};

export type DocPage = DocRoute & {
  content: RenderableTreeNodes;
  headings: Heading[];
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
