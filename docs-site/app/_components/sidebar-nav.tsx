"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/docs/types";

type SidebarNavProps = {
  items: NavItem[];
};

export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();

  return <NavList items={items} pathname={pathname} />;
}

function NavList({ items, pathname }: SidebarNavProps & { pathname: string }) {
  return (
    <ul className="docs-nav">
      {items.map((item) => (
        <li className="docs-nav__item" key={item.href}>
          <Link
            aria-current={pathname === item.href ? "page" : undefined}
            className={
              pathname === item.href
                ? "docs-nav__link docs-nav__link--active"
                : "docs-nav__link"
            }
            href={item.href}
          >
            {item.title}
          </Link>
          {item.children.length > 0 ? (
            <div className="docs-nav__children">
              <NavList items={item.children} pathname={pathname} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
