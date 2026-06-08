// A · Editorial split layout — numbered sections divided by hairlines in one
// column, with a sticky live-preview rail on the right (desktop) and a
// collapsible preview at the top (mobile). Shared by both Create flows.

import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { LivePulse, SectionHead } from "./ui";

export interface CreateSection {
  key: string;
  /** Two-digit index shown in the section header, e.g. "01". */
  n: string;
  title: string;
  desc?: string;
  icon: LucideIcon;
  node: ReactNode;
}

interface CreateSplitLayoutProps {
  title: string;
  subtitle: string;
  sections: CreateSection[];
  preview: ReactNode;
  /** Submit button(s) — rendered below the sections. */
  actions: ReactNode;
  error?: ReactNode;
  footnote?: string;
}

export function CreateSplitLayout({
  title,
  subtitle,
  sections,
  preview,
  actions,
  error,
  footnote,
}: CreateSplitLayoutProps): JSX.Element {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-16 md:px-6 lg:px-8">
      <header className="mb-8 md:mb-10">
        <h1 className="font-serif text-3xl tracking-tight text-stone-100 md:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-stone-400 md:text-[15px]">
          {subtitle}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-10">
        <div className="min-w-0">
          {/* Mobile: collapsible preview */}
          <details className="group mb-6 overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/40 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">
              <span className="flex items-center gap-2">
                <LivePulse /> Live preview
              </span>
              <ChevronDown className="h-4 w-4 text-stone-500 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 pb-4">{preview}</div>
          </details>

          <div className="divide-y divide-stone-800/80">
            {sections.map((sec) => (
              <section key={sec.key} className="py-7 first:pt-0">
                <SectionHead
                  n={sec.n}
                  title={sec.title}
                  desc={sec.desc}
                  icon={sec.icon}
                />
                <div className="mt-5 md:pl-[52px]">{sec.node}</div>
              </section>
            ))}
          </div>

          {error}

          <div className="mt-8">{actions}</div>
          {footnote && (
            <div className="mt-4 text-center text-xs text-stone-500">
              {footnote}
            </div>
          )}
        </div>

        {/* Desktop: sticky preview rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <div className="mb-3 flex items-center gap-2 whitespace-nowrap text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">
              <LivePulse /> Live preview
            </div>
            {preview}
          </div>
        </aside>
      </div>
    </div>
  );
}
