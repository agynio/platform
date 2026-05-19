import type { Heading } from "@/lib/docs/types";

type ArticleTocProps = {
  headings: Heading[];
};

export function ArticleToc({ headings }: ArticleTocProps) {
  if (headings.length < 2) {
    return null;
  }

  return (
    <aside className="docs-toc" aria-label="On this page">
      <p className="docs-toc__title">On this page</p>
      <ul className="docs-toc__list">
        {headings.map((heading) => (
          <li
            className={`docs-toc__item docs-toc__item--level-${heading.level}`}
            key={heading.id}
          >
            <a className="docs-toc__link" href={`#${heading.id}`}>
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
