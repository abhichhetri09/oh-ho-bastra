import { z } from "zod";

/** What a contact message is about; the store's email subject names it. */
export const CONTACT_TOPICS = ["order", "return", "custom", "other"] as const;
export const ContactTopicSchema = z
  .enum(CONTACT_TOPICS)
  .meta({ id: "ContactTopic" });
export type ContactTopic = z.infer<typeof ContactTopicSchema>;

export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  order: "An order",
  return: "A return or exchange",
  custom: "A custom print",
  other: "Something else",
};

/** Limits of the contact form. */
export const CONTACT_LIMITS = {
  name: 80,
  email: 254,
  order_number: 20,
  message: 4000,
} as const;

export const ContactBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Enter your name")
      .max(
        CONTACT_LIMITS.name,
        `Keep your name to ${CONTACT_LIMITS.name} characters`,
      ),
    email: z.email("Enter a valid email address").max(CONTACT_LIMITS.email),
    topic: ContactTopicSchema,
    order_number: z
      .string()
      .trim()
      .max(CONTACT_LIMITS.order_number, "That order number is too long")
      .optional(),
    message: z
      .string()
      .trim()
      .min(10, "Tell us a little more (at least 10 characters)")
      .max(
        CONTACT_LIMITS.message,
        `Keep your message to ${CONTACT_LIMITS.message} characters`,
      ),
    website: z
      .string()
      .optional()
      .describe("Leave empty. A hidden field that only bots fill in."),
  })
  .meta({
    id: "ContactBody",
    description: "A message from the storefront's contact form to the store.",
  });
export type ContactBody = z.infer<typeof ContactBodySchema>;
