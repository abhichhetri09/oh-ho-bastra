// Store-wide copy and editorial imagery in one place, so rebranding or
// swapping the photography is a one-file change. Editorial photos live in
// public/editorial (credits in CREDITS.md there); product images are
// Cloudinary uploads. What shipping costs is the admin's (Admin → Settings
// → Delivery): the copy that names it takes the store's rule.

import type { ShippingRule } from "@repo/types";
import { shippingSentence } from "./shipping";

const IMG = "/editorial";

export const site = {
  name: "Oh Ho Bastra",
  // When the terms and privacy policy last changed (shown on both pages).
  // The seller's details live in Admin → Settings (storeBusiness).
  legalUpdated: "2026-11-01",
  // The footer's social links; one left "" is not shown.
  social: {
    instagram: "https://www.instagram.com/ohhobastra/",
    facebook: "https://www.facebook.com/ohhobastra",
    tiktok: "https://www.tiktok.com/@ohhobastra",
  },
  tagline: "Tees, and the ones we print for you",
  description:
    "Heavyweight cotton t-shirts in a few good colours, plus custom prints and text when you want something that isn't on the rack.",
  // The top banner's messages until an admin edits them (Admin → Settings),
  // and its fallback while the API can't be reached.
  announcement: [
    "Free shipping on orders over €60",
    "30-day returns on plain tees",
    "Custom prints: send your art or a line of type",
  ],
  // The landing page, top to bottom (app/(shop)/page.tsx). The hero's last
  // title line is the theme's emphasis.
  hero: {
    title: ["Tees. And the", "ones we print", "for you."],
    body: "Heavyweight cotton tees, custom printing and streetwear essentials.",
    cta: { label: "Shop all", href: "/shop" },
    image: `${IMG}/rack-colours.jpg`,
    imageAlt: "Tees in assorted colours hanging on a rail",
  },
  // The category tiles come from the store's own categories (the three
  // biggest with products); these photos stand in for one without any.
  tileImages: [
    `${IMG}/white-hanger.jpg`,
    `${IMG}/custom-text.jpg`,
    `${IMG}/black-mint-folded.jpg`,
  ],
  picks: { title: "Editor's picks", href: "/shop?featured=true" },
  shippingCopy: (shipping: ShippingRule) =>
    `${shippingSentence(shipping)} Orders ship in two to four working days. Plain tees can be returned within 30 days of delivery (return postage is yours); custom prints are made for you and can't be returned unless faulty.`,
  authImage: `${IMG}/white-hanger.jpg`,
  authImageAlt: "A plain white tee on a wooden hanger",
} as const;
