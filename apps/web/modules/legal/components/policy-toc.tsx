"use client";

import { useEffect, useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

type TocSection = { id: string; title: string };

/** The section nearest the top of the viewport, tracked as the page scrolls. */
function useActiveSection(sections: TocSection[]) {
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    const first = els[0];
    const last = els.at(-1);
    if (!first || !last) return;

    const update = () => {
      // The last section whose top has passed a line a third of the way down.
      const line = window.innerHeight / 3;
      let current = first.id;
      for (const el of els) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      // At the very bottom, the last section is the one being read.
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
        current = last.id;
      }
      setActive(current);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sections]);

  return active;
}

const number = (i: number) => String(i + 1).padStart(2, "0");

/** "On this page" in the sidebar, with the section being read highlighted. */
export function PolicyToc({ sections }: { sections: TocSection[] }) {
  const active = useActiveSection(sections);
  const index = Math.max(
    0,
    sections.findIndex((s) => s.id === active),
  );

  return (
    <nav aria-label="On this page">
      <p className="eyebrow mb-4">On this page</p>
      <div className="relative">
        {/* The rail fills up to the section being read. */}
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-px bg-border"
        />
        <span
          aria-hidden
          className="absolute top-0 left-0 w-px bg-foreground transition-[height] duration-500 ease-out"
          style={{ height: `${((index + 1) / sections.length) * 100}%` }}
        />
        <ol className="space-y-0.5 text-[0.8125rem]">
          {sections.map((section, i) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={section.id === active ? "location" : undefined}
                className={cn(
                  "flex gap-3 py-1.5 pl-4 transition-colors",
                  section.id === active
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="pt-px font-mono text-[0.6875rem] tabular-nums opacity-60">
                  {number(i)}
                </span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

/** "On this page" on phones: a disclosure that closes once a section is picked. */
export function PolicyTocMobile({ sections }: { sections: TocSection[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-panel border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-medium">On this page</span>
          <span className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
            {sections.length} sections
          </span>
        </span>
        <CaretDownIcon
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <ol className="overflow-hidden" inert={!open}>
          {sections.map((section, i) => (
            <li key={section.id} className="border-t border-border">
              <a
                href={`#${section.id}`}
                onClick={() => setOpen(false)}
                className="flex gap-3 px-4 py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="pt-px font-mono text-[0.6875rem] tabular-nums">
                  {number(i)}
                </span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
