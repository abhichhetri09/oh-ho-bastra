export const wishlistKeys = {
  all: ["wishlist"] as const,
  ids: (userId: string) => [...wishlistKeys.all, userId, "ids"] as const,
  list: (userId: string) => [...wishlistKeys.all, userId, "list"] as const,
};
