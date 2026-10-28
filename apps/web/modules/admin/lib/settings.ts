// Admin → Settings: its pages (the sub-navigation, each page's heading and
// the command palette's entries).

export type SettingsPageId =
  | "store"
  | "appearance"
  | "announcements"
  | "delivery";

export type SettingsPage = {
  id: SettingsPageId;
  href: string;
  label: string;
  /** A few words under the label in the sub-navigation. */
  hint: string;
  /** One sentence under the page's heading. */
  description: string;
};

export const SETTINGS_PAGES: SettingsPage[] = [
  {
    id: "store",
    href: "/admin/settings/store",
    label: "Store details",
    hint: "Seller, Y-tunnus, contact",
    description:
      "Who's selling and how shoppers reach you, shown in the footer, contact page and legal pages.",
  },
  {
    id: "appearance",
    href: "/admin/settings/appearance",
    label: "Appearance",
    hint: "Theme, font and corners",
    description:
      "Colours, type and corners for the whole storefront. Choosing previews it here; save to show it to shoppers.",
  },
  {
    id: "announcements",
    href: "/admin/settings/announcements",
    label: "Announcement bar",
    hint: "Top banner messages",
    description:
      "Short messages that scroll across the top of every shop page, in order. Turn it off to hide it without losing them.",
  },
  {
    id: "delivery",
    href: "/admin/settings/delivery",
    label: "Delivery",
    hint: "Price and free threshold",
    description:
      "One price for every order, free from a total you choose. The threshold counts the bag after any discount code.",
  },
];

export function settingsPage(id: SettingsPageId): SettingsPage {
  return SETTINGS_PAGES.find((page) => page.id === id)!;
}

/** Whether pathname is (inside) a settings page. */
export function isSettingsCurrent(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
