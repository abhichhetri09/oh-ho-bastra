export const reviewKeys = {
  all: ["reviews"] as const,
  list: (slug: string) => [...reviewKeys.all, slug, "list"] as const,
  mine: (userId: string, slug: string) =>
    [...reviewKeys.all, slug, "mine", userId] as const,
};
