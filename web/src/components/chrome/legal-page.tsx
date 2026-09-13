import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/ui/cn";

/**
 * Shared shell for `/privacy` and `/terms` (spec 17 Part 5 "Legal pages").
 * Replaces the old per-page `sticky top-0` sub-header (L-3) - which sat
 * permanently hidden behind the global fixed header anyway - with an
 * in-page contents list under the title. Both pages rely on the root
 * `<main>` element's global frame padding (spec 17 §4.2) for clearance
 * below the fixed header; neither adds its own top padding.
 */
export interface LegalSection {
  id: string;
  label: string;
}

export interface LegalPageHeaderProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
}

export function LegalPageHeader({ icon: Icon, eyebrow, title, lastUpdated, sections }: LegalPageHeaderProps) {
  return (
    <div className="mb-12 border-b border-neutral-200 pb-10">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-label text-ink-3 uppercase">
        <Icon className="size-3.5 text-ink" aria-hidden />
        {eyebrow}
      </div>
      <h1 className="mb-4 text-h1 font-extrabold text-ink">{title}</h1>
      <p className="text-caption text-ink-4">Last updated: {lastUpdated}</p>

      {sections.length > 0 ? (
        <nav aria-label="Contents" className="mt-8 rounded-2xl bg-white p-4 sm:p-5">
          <p className="mb-3 text-label text-ink-3 uppercase">Contents</p>
          <ol className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {sections.map((section, index) => (
              <li key={section.id} className="text-base">
                <a href={`#${section.id}`} className="text-link hover:underline">
                  {index + 1}. {section.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
    </div>
  );
}

export interface LegalFooterLink {
  href: string;
  label: string;
  current?: boolean;
}

export function LegalPageFooter({ links }: { links: LegalFooterLink[] }) {
  return (
    <footer className="-mx-[var(--gutter)] mt-16 border-t border-neutral-200 bg-white py-12">
      <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 px-[var(--gutter)] text-caption text-ink-3 sm:flex-row">
        <p>© {new Date().getFullYear()} Bank Rock. Built for ETHGlobal.</p>
        <div className="flex flex-wrap items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "inline-flex h-11 items-center px-2 text-sm motion-safe:transition-colors",
                link.current ? "font-semibold text-ink" : "text-ink-3 hover:text-ink"
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
