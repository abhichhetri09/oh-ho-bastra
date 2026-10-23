import { html as h, url as u } from "./escape";

// The four email templates (internal/emails/templates/*.tmpl), written out
// with the output Go's templates produced, whitespace trimming included. The
// HTML ones escape every value as html/template did; the text ones print
// values as they are.

/** The order an email is about, as the templates see it. */
export interface OrderView {
  storeName: string;
  preheader: string;
  heading: string;
  intro: string;
  greeting: string; // "Hi Ada,"
  label: string; // "OHB-1001"
  placedOn: string;
  url: string; // the order on the storefront
  shopUrl: string;
  items: ItemView[];
  subtotal: string;
  shipping: string;
  total: string;
  tracking: string;
  address: string[] | null; // the shipping address, one line each
}

export interface ItemView {
  name: string;
  options: string; // "Black / M"
  quantity: number;
  lineTotal: string;
  image: string;
}

export interface ResetView {
  storeName: string;
  greeting: string;
  url: string;
  shopUrl: string;
}

const HEAD = (title: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#faf8f4;color:#24201c;-webkit-text-size-adjust:100%;">
`;

const LAYOUT_TOP = (
  preheader: string,
  shopUrl: string,
  storeName: string,
) => `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#faf8f4;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;">

<tr><td style="padding:0 0 28px;">
<a href="${u(shopUrl)}" style="font-family:Georgia,'Times New Roman',serif;font-size:24px;color:#24201c;text-decoration:none;"><img src="${u(shopUrl)}/email/mark.png" width="17" height="17" alt="" style="display:inline-block;width:17px;height:17px;margin-right:7px;border:0;vertical-align:baseline;">${h(storeName)}</a>
</td></tr>
`;

const LAYOUT_BOTTOM = `
</table>
</td></tr>
</table>
</body>
</html>
`;

/** email.html.tmpl */
export function orderHtml(v: OrderView): string {
  const tracking = v.tracking
    ? `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background:#f3efe8;">
<tr><td style="padding:14px 16px;">
<p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7a6f63;">Tracking number</p>
<p style="margin:2px 0 0;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:15px;color:#24201c;">${h(v.tracking)}</p>
</td></tr>
</table>`
    : "";
  const items = v.items
    .map(
      (it) => `
<tr>
<td width="64" valign="top" style="padding:16px 14px 16px 0;">${
        it.image
          ? `<img src="${u(it.image)}" width="64" height="80" alt="" style="display:block;width:64px;height:80px;object-fit:cover;background:#f3efe8;border:0;">`
          : `<div style="width:64px;height:80px;background:#f3efe8;"></div>`
      }
</td>
<td valign="top" style="padding:16px 0;">
<p style="margin:0;color:#24201c;">${h(it.name)}</p>${
        it.options
          ? `<p style="margin:2px 0 0;font-size:13px;color:#7a6f63;">${h(it.options)}</p>`
          : ""
      }
<p style="margin:2px 0 0;font-size:13px;color:#7a6f63;">Qty ${it.quantity}</p>
</td>
<td valign="top" align="right" style="padding:16px 0 16px 12px;white-space:nowrap;">${h(it.lineTotal)}</td>
</tr>
<tr><td colspan="3" style="border-bottom:1px solid #e6e1d8;font-size:0;line-height:0;">&nbsp;</td></tr>`,
    )
    .join("");
  const address = v.address?.length
    ? `
<p style="margin:28px 0 4px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7a6f63;">Shipping to</p>
<p style="margin:0;font-size:14px;color:#4a423a;">${v.address.map(h).join("<br>")}</p>`
    : "";

  return (
    HEAD(h(v.heading)) +
    LAYOUT_TOP(h(v.preheader), v.shopUrl, v.storeName) +
    `
<tr><td style="background:#ffffff;border:1px solid #e6e1d8;padding:32px 28px;">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7a6f63;">Order ${h(v.label)}${v.placedOn ? ` · ${h(v.placedOn)}` : ""}</p>
<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:28px;line-height:1.2;color:#24201c;">${h(v.heading)}</h1>
<p style="margin:0 0 12px;">${h(v.greeting)}</p>
<p style="margin:0 0 24px;color:#4a423a;">${h(v.intro)}</p>${tracking}

<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
<tr><td style="background:#24201c;">
<a href="${u(v.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;color:#faf8f4;text-decoration:none;">View your order</a>
</td></tr>
</table>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #e6e1d8;">${items}
</table>

<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0 0;font-size:14px;">
<tr><td style="padding:3px 0;color:#4a423a;">Subtotal</td><td align="right" style="padding:3px 0;">${h(v.subtotal)}</td></tr>
<tr><td style="padding:3px 0;color:#4a423a;">Shipping</td><td align="right" style="padding:3px 0;">${h(v.shipping)}</td></tr>
<tr><td style="padding:10px 0 0;font-size:15px;color:#24201c;"><strong>Total</strong></td><td align="right" style="padding:10px 0 0;font-size:15px;"><strong>${h(v.total)}</strong></td></tr>
</table>${address}
</td></tr>

<tr><td style="padding:24px 4px 0;font-size:12px;line-height:1.6;color:#7a6f63;">
You're receiving this email because you placed an order at ${h(v.storeName)}. Your orders and their status are always in <a href="${u(v.shopUrl)}/account/orders" style="color:#7a6f63;">your account</a>.
</td></tr>
` +
    LAYOUT_BOTTOM
  );
}

/** email.txt.tmpl */
export function orderText(v: OrderView): string {
  return `${v.heading}
Order ${v.label}${v.placedOn ? ` · ${v.placedOn}` : ""}

${v.greeting}

${v.intro}
${v.tracking ? `\nTracking number: ${v.tracking}\n` : ""}
View your order: ${v.url}

${v.items.map((it) => `${it.quantity} × ${it.name}${it.options ? ` (${it.options})` : ""}  ${it.lineTotal}\n`).join("")}
Subtotal  ${v.subtotal}
Shipping  ${v.shipping}
Total     ${v.total}
${v.address?.length ? `\nShipping to:\n${v.address.map((line) => line + "\n").join("")}` : ""}
--
${v.storeName}
${v.shopUrl}
`;
}

/** reset.html.tmpl */
export function resetHtml(v: ResetView): string {
  return (
    HEAD("Reset your password") +
    LAYOUT_TOP(
      `Choose a new password for your ${h(v.storeName)} account.`,
      v.shopUrl,
      v.storeName,
    ) +
    `
<tr><td style="background:#ffffff;border:1px solid #e6e1d8;padding:32px 28px;">
<h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:28px;line-height:1.2;color:#24201c;">Reset your password</h1>
<p style="margin:0 0 12px;">${h(v.greeting)}</p>
<p style="margin:0 0 24px;color:#4a423a;">Someone (we hope you) asked to reset the password for your ${h(v.storeName)} account. Choose a new one below. The link works once, for the next hour.</p>

<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
<tr><td style="background:#24201c;">
<a href="${u(v.url)}" style="display:inline-block;padding:12px 22px;font-size:14px;color:#faf8f4;text-decoration:none;">Choose a new password</a>
</td></tr>
</table>

<p style="margin:0;font-size:13px;color:#7a6f63;">If you didn't ask for this, ignore this email: your password stays as it is.</p>
</td></tr>

<tr><td style="padding:24px 4px 0;font-size:12px;color:#7a6f63;">
<a href="${u(v.shopUrl)}" style="color:#7a6f63;">${h(v.storeName)}</a>
</td></tr>
` +
    LAYOUT_BOTTOM
  );
}

/** reset.txt.tmpl */
export function resetText(v: ResetView): string {
  return `Reset your password

${v.greeting}

Someone (we hope you) asked to reset the password for your ${v.storeName} account. Choose a new one here; the link works once, for the next hour:

${v.url}

If you didn't ask for this, ignore this email: your password stays as it is.

--
${v.storeName}
${v.shopUrl}
`;
}
