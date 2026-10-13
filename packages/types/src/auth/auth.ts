import { z } from "zod";
import { successResponse } from "../api/response";
import { PublicUserSchema } from "../user/user";

// Mirrors apps/api/internal/types/auth.go. Emails are trimmed and lowercased
// by the API; passwords are never trimmed (bcrypt reads at most 72 bytes).

// Messages match the API's validator, so client and server errors read alike.
const email = z
  .email("Enter a valid email address")
  .max(254, "Email cannot exceed 254 characters");

export const RegisterBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name cannot exceed 50 characters")
      // Mirrors the API's personname rule: José, O'Brien, Mary-Jane, J. R.
      .regex(
        /^\p{L}[\p{L}\p{M} '’.-]*$/u,
        "Name can only contain letters, spaces, apostrophes and hyphens",
      ),
    email,
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password cannot exceed 72 characters"),
  })
  .meta({ id: "RegisterBody" });
export type RegisterBody = z.infer<typeof RegisterBodySchema>;

export const ForgotPasswordBodySchema = z
  .object({ email })
  .meta({ id: "ForgotPasswordBody" });
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBodySchema>;

export const ResetPasswordBodySchema = z
  .object({
    token: z.string().min(1, "This reset link is incomplete").max(100),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password cannot exceed 72 characters"),
  })
  .meta({ id: "ResetPasswordBody" });
export type ResetPasswordBody = z.infer<typeof ResetPasswordBodySchema>;

export const UpdateProfileBodySchema = z
  .object({ name: RegisterBodySchema.shape.name })
  .meta({ id: "UpdateProfileBody" });
export type UpdateProfileBody = z.infer<typeof UpdateProfileBodySchema>;

export const ChangePasswordBodySchema = z
  .object({
    current_password: z
      .string()
      .min(1, "Enter your current password")
      .max(72, "Password cannot exceed 72 characters"),
    new_password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password cannot exceed 72 characters"),
  })
  .meta({ id: "ChangePasswordBody" });
export type ChangePasswordBody = z.infer<typeof ChangePasswordBodySchema>;

export const LoginBodySchema = z
  .object({
    email,
    password: z
      .string()
      .min(1, "Password is required")
      .max(72, "Password cannot exceed 72 characters"),
  })
  .meta({ id: "LoginBody" });
export type LoginBody = z.infer<typeof LoginBodySchema>;

export const UserResponseSchema = successResponse(PublicUserSchema).meta({
  id: "UserResponse",
  description: "Returned by register, login and /auth/me.",
});
export type UserResponse = z.infer<typeof UserResponseSchema>;
