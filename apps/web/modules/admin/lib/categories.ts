import type { CategoryNode } from "@repo/types";

/**
 * The tree in display order: each parent followed by its children, A–Z at
 * every level. The API sends parents before children, which is not the same.
 */
export function orderTree(nodes: readonly CategoryNode[]): CategoryNode[] {
  const children = new Map<string | null, CategoryNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parent_id) ?? [];
    siblings.push(node);
    children.set(node.parent_id, siblings);
  }
  const out: CategoryNode[] = [];
  const visit = (parent: string | null) => {
    const siblings = [...(children.get(parent) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const node of siblings) {
      out.push(node);
      visit(node.id);
    }
  };
  visit(null);
  return out;
}

/** The category and everything under it: none of them can be its parent. */
export function subtreeIds(
  nodes: readonly CategoryNode[],
  rootId: string,
): Set<string> {
  const ids = new Set([rootId]);
  // Parents come before children in either order, so one pass is enough.
  for (const node of orderTree(nodes)) {
    if (node.parent_id && ids.has(node.parent_id)) ids.add(node.id);
  }
  return ids;
}

/** "Clothing / Tops", for a category select. */
export function categoryPath(
  nodes: readonly CategoryNode[],
  id: string,
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const names: string[] = [];
  let node = byId.get(id);
  while (node && names.length <= nodes.length) {
    names.unshift(node.name);
    node = node.parent_id ? byId.get(node.parent_id) : undefined;
  }
  return names.join(" / ");
}
