import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SidebarNav } from "./_components/sidebar-nav";
import { getNavigation } from "@/lib/docs/navigation";

export const metadata: Metadata = {
  title: {
    default: "Agyn Docs",
    template: "%s | Agyn Docs",
  },
  description: "Documentation for building and operating AI agents with Agyn.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const navigation = await getNavigation();

  return (
    <html lang="en">
      <body>
        <div className="docs-shell">
          <aside className="docs-sidebar">
            <Link className="docs-sidebar__title" href="/">
              Agyn Docs
            </Link>
            <SidebarNav items={navigation} />
          </aside>
          <main className="docs-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
