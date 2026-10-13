import type { CategoryNode } from "@repo/types";

export type CategoryTreeNode = CategoryNode & { children: CategoryTreeNode[] };

/** Nests the flat list from GET /categories (parents come first). */
export function buildCategoryTree(nodes: CategoryNode[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  const roots: CategoryTreeNode[] = [];
  for (const node of nodes) {
    const treeNode = { ...node, children: [] };
    byId.set(node.id, treeNode);
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(treeNode);
    else roots.push(treeNode);
  }
  return roots;
}

/** The category with slug and its ancestors, root first; [] if unknown. */
export function categoryPath(
  nodes: CategoryNode[],
  slug: string,
): CategoryNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: CategoryNode[] = [];
  let current = nodes.find((n) => n.slug === slug);
  while (current && path.length <= nodes.length) {
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}

/** The direct children of the category with slug. */
export function childCategories(
  nodes: CategoryNode[],
  slug: string,
): CategoryNode[] {
  const parent = nodes.find((n) => n.slug === slug);
  return parent ? nodes.filter((n) => n.parent_id === parent.id) : [];
}
