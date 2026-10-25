// Store-wide copy and editorial imagery in one place, so rebranding or
// swapping the photography is a one-file change. Editorial photos live in
// public/editorial (credits in CREDITS.md there); product images are
// Cloudinary uploads.

const IMG = "/editorial";

export const site = {
  name: "Oh Ho Bastra",
  // When the terms and privacy policy last changed (shown on both pages).
  // The seller's details live in Admin → Settings (storeBusiness).
  legalUpdated: "2026-10-25",
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
  hero: {
    eyebrow: "Oh Ho Bastra",
    title: ["Tees. And the ones", "we print for you."],
    body: "Heavyweight cotton, a few colours. Custom prints and text when you want something that isn't on the rack.",
    image: `${IMG}/rack-colours.jpg`,
    imageAlt: "Tees in assorted colours hanging on a rail",
    secondaryImage: `${IMG}/custom-text.jpg`,
    secondaryAlt: "Two tees printed with custom text",
  },
  story: {
    eyebrow: "Custom",
    title: "Your art. Our tee.",
    body: "Custom is the same heavyweight tee with your artwork or a line of type. Pick a colour and a size, then send the file or the words after you order.",
    image: `${IMG}/sage-rack.jpg`,
    imageAlt: "A row of sage green tees on wooden hangers",
    href: "/shop",
    cta: "Shop tees",
  },
  values: [
    {
      title: "Free shipping over €60",
      body: "Dispatched in two to four working days.",
    },
    {
      title: "30-day returns",
      body: "Wrong size? Send plain tees back within 30 days.",
    },
    {
      title: "Secure checkout",
      body: "Payments handled by Stripe. We never see your card.",
    },
    {
      title: "Heavyweight cotton",
      body: "Regular and boxy cuts that keep their shape wash after wash.",
    },
  ],
  shippingCopy:
    "Free standard shipping on orders over €60; otherwise a flat €4.90. Orders ship in two to four working days. Plain tees can be returned within 30 days of delivery (return postage is yours); custom prints are made for you and can't be returned unless faulty.",
  authImage: `${IMG}/white-hanger.jpg`,
  authImageAlt: "A plain white tee on a wooden hanger",
} as const;
