import { z } from "zod";
import { Uuid } from "../api/response";

export const UserRoleSchema = z
  .enum(["admin", "customer"])
  .meta({ id: "UserRole" });
export type UserRole = z.infer<typeof UserRoleSchema>;

export const PublicUserSchema = z
  .object({
    id: Uuid,
    name: z.string(),
    email: z.email(),
    role: UserRoleSchema,
    image_url: z.url().nullable(),
  })
  .meta({ id: "PublicUser", description: "The user as the API exposes it." });
export type PublicUser = z.infer<typeof PublicUserSchema>;
