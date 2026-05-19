import Markdoc from "@markdoc/markdoc";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import React from "react";
import { ArticleToc } from "@/app/_components/article-toc";
import { CodeBlock } from "@/app/_components/code-block";
import { Mermaid } from "@/app/_components/mermaid";
import { getAllDocRoutes, getDocPage } from "@/lib/docs/pages";

type PageProps = {
  params: Promise<{
    slug?: string[];
  }>;
};

export const dynamicParams = false;

export async function generateStaticParams() {
  const routes = await getAllDocRoutes();

  return routes.map((route) => ({
    slug: route.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug = [] } = await params;
  const page = await getDocPage(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.frontmatter.title,
    description: page.frontmatter.description,
  };
}

export default async function DocPage({ params }: PageProps) {
  const { slug = [] } = await params;
  const page = await getDocPage(slug);

  if (!page) {
    notFound();
  }

  const rendered = Markdoc.renderers.react(page.content, React, {
    components: {
      CodeBlock,
      Mermaid,
    },
  });

  return (
    <>
      <article className="docs-article">{rendered}</article>
      <ArticleToc headings={page.headings} />
    </>
  );
}
