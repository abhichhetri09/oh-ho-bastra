import { schemas } from "../schemas.ts";
import { body, operation } from "./shared.ts";

const tag = "Auth";
const sessionCookies =
  "Sets the `access_token` and `refresh_token` (HTTP-only) cookies and the readable `is_logged_in` cookie.";

export function registerAuthPaths() {
  operation({
    method: "post",
    path: "/api/v1/auth/register",
    operationId: "register",
    tag,
    summary: "Register",
    description: `Creates a customer account and starts a session. ${sessionCookies} The email is trimmed and lowercased.`,
    request: body(schemas.RegisterBodySchema),
    success: {
      status: 201,
      description: "Registration successful",
      schema: schemas.UserResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      409: "Email already registered (USER_ALREADY_EXISTS)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/auth/login",
    operationId: "login",
    tag,
    summary: "Log in",
    description: `Starts a new session. ${sessionCookies}`,
    request: body(schemas.LoginBodySchema),
    success: {
      status: 200,
      description: "Logged in successfully",
      schema: schemas.UserResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      401: "Unknown email or wrong password (INVALID_CREDENTIALS)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/auth/password/forgot",
    operationId: "forgotPassword",
    tag,
    summary: "Email a password reset link",
    description:
      "Emails a link to choose a new password, valid once for an hour. Answers the same 202 whether or not the email has an account (the email goes out after the reply), and sends an account at most one link a minute.",
    request: body(schemas.ForgotPasswordBodySchema),
    success: {
      status: 202,
      description: "If the email has an account, a link is on its way",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      503: "Mail isn't configured on this server (MAIL_UNAVAILABLE)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/auth/password/reset",
    operationId: "resetPassword",
    tag,
    summary: "Set a new password from a reset link",
    description:
      "Sets the password with the token from the emailed link, uses the link up, and signs the account out of every session.",
    request: body(schemas.ResetPasswordBodySchema),
    success: {
      status: 200,
      description: "Password changed",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED), or an unknown, used or expired link (INVALID_RESET_TOKEN)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/auth/logout",
    operationId: "logout",
    tag,
    summary: "Log out",
    description:
      "Revokes the session of the refresh token cookie, if any, and always clears the auth cookies.",
    auth: "refresh-optional",
    success: {
      status: 200,
      description: "Logged out successfully",
      schema: schemas.MessageResponseSchema,
    },
  });

  operation({
    method: "post",
    path: "/api/v1/auth/refresh",
    operationId: "refreshSession",
    tag,
    summary: "Refresh the session",
    description:
      "Rotates the refresh token and issues a new access token. A request that lost a concurrent rotation within 30 seconds gets a new access token only. Reusing an older refresh token revokes the session. Every 401 clears the auth cookies.",
    auth: "refresh",
    success: {
      status: 200,
      description: "Tokens refreshed",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      401: "Missing, invalid, expired or reused refresh token (MISSING_REFRESH_TOKEN, INVALID_REFRESH_TOKEN)",
    },
  });

  operation({
    method: "get",
    path: "/api/v1/auth/me",
    operationId: "getMe",
    tag,
    summary: "Get the current user",
    description:
      "Reads the user fresh from the database, not from the token claims.",
    auth: "user",
    success: {
      status: 200,
      description: "User fetched",
      schema: schemas.UserResponseSchema,
    },
    errors: { 404: "The user no longer exists (USER_NOT_FOUND)" },
  });

  operation({
    method: "patch",
    path: "/api/v1/auth/me",
    operationId: "updateProfile",
    tag,
    summary: "Change your name",
    description:
      "Saves the name and sets a fresh `access_token` cookie carrying it (pages read the name from the token).",
    auth: "user",
    request: body(schemas.UpdateProfileBodySchema),
    success: {
      status: 200,
      description: "Your details are saved",
      schema: schemas.UserResponseSchema,
    },
    errors: {
      400: "Invalid body (VALIDATION_FAILED)",
      404: "The user no longer exists (USER_NOT_FOUND)",
    },
  });

  operation({
    method: "post",
    path: "/api/v1/auth/me/password",
    operationId: "changePassword",
    tag,
    summary: "Change your password",
    description:
      "Checks the current password, sets the new one and signs out every other session (the one asking stays signed in). A wrong current password is a VALIDATION_FAILED field error on `current_password`, not a 401.",
    auth: "user",
    request: body(schemas.ChangePasswordBodySchema),
    success: {
      status: 200,
      description: "Password changed",
      schema: schemas.MessageResponseSchema,
    },
    errors: {
      400: "Invalid body, or a wrong current password (VALIDATION_FAILED)",
      404: "The user no longer exists (USER_NOT_FOUND)",
    },
  });
}
