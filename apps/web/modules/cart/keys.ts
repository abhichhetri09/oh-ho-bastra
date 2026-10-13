// The cart belongs to a user, so its key carries the user's id: another
// account on the same browser never sees a cached cart.
export const cartKeys = {
  all: ["cart"] as const,
  mine: (userId: string) => [...cartKeys.all, userId] as const,
};
