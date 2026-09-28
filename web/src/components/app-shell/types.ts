import type { LucideIcon } from "@/components/icons";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Count shown next to the label (hidden when 0 or undefined). */
  badge?: number;
  /** Sub-pages, shown indented under the item while you're inside it. */
  children?: Omit<NavItem, "children">[];
};

export type NavSection = { title?: string; items: NavItem[] };

export type ShellConfig = {
  /** Small label next to the logo, e.g. "Admin" or "Account". */
  label: string;
  /** Where the logo links to. */
  home: string;
  sections: NavSection[];
};
