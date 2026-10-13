// Per-user data keys carry the user's id, like the cart's.
export const orderKeys = {
  all: ["orders"] as const,
  list: (userId: string) => [...orderKeys.all, userId, "list"] as const,
  detail: (userId: string, number: number) =>
    [...orderKeys.all, userId, "detail", number] as const,
  session: (userId: string, sessionId: string) =>
    [...orderKeys.all, userId, "session", sessionId] as const,
};

export const addressKeys = {
  mine: (userId: string) => ["addresses", userId] as const,
};
