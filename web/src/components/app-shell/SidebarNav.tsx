import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/utils";
import type { NavItem, NavSection } from "./types";

const rowClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors";
const activeClass = "bg-background font-medium text-foreground shadow-sm ring-1 ring-border";
const idleClass = "text-muted-foreground hover:bg-background/70 hover:text-foreground";

function Badge({ count }: { count?: number }) {
  return count ? (
    <span className="rounded-full bg-foreground px-1.5 text-[11px] font-medium text-background tabular-nums">
      {count}
    </span>
  ) : null;
}

function LinkItem({ item, onNavigate, nested = false }: { item: Omit<NavItem, "children">; onNavigate?: () => void; nested?: boolean }) {
  const { to, label, icon: Icon, end, badge } = item;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) => cn(rowClass, nested && "py-1.5", isActive ? activeClass : idleClass)}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="flex-1">{label}</span>
      <Badge count={badge} />
    </NavLink>
  );
}

/** A parent row that expands to its sub-pages; open automatically while you're inside it. */
function GroupItem({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const inside = pathname === item.to || pathname.startsWith(`${item.to}/`);
  // null = follow the route; true/false = the user toggled it.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? inside;
  const Icon = item.icon;
  const id = `nav-${item.to.replace(/\W+/g, "-")}`;

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setToggled(!open)}
        className={cn(rowClass, inside ? "font-medium text-foreground hover:bg-background/70" : idleClass)}
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
        <span className="flex-1 text-left">{item.label}</span>
        <Badge count={item.badge} />
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div id={id} className="mt-1 ml-5 space-y-0.5 border-l pl-2">
          {item.children?.map((child) => (
            <LinkItem key={child.to} item={child} onNavigate={onNavigate} nested />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SidebarNav({
  sections,
  label,
  onNavigate,
}: {
  sections: NavSection[];
  label: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-6" aria-label={label}>
      {sections.map((section, index) => (
        <div key={section.title ?? index} className="space-y-1">
          {section.title ? (
            <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {section.title}
            </p>
          ) : null}
          {section.items.map((item) =>
            item.children?.length ? (
              <GroupItem key={item.to} item={item} onNavigate={onNavigate} />
            ) : (
              <LinkItem key={item.to} item={item} onNavigate={onNavigate} />
            ),
          )}
        </div>
      ))}
    </nav>
  );
}
