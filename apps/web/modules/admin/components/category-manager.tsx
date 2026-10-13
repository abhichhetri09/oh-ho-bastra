"use client";

import { useMemo, useState } from "react";
import {
  DotsThreeIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import { CategoryBodySchema, type CategoryNode } from "@repo/types";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  adminCreateCategory,
  adminDeleteCategory,
  adminUpdateCategory,
} from "@/lib/api/client";
import { getApiError, mapFieldErrors } from "@/lib/api/errors";
import { friendlyFieldErrors } from "@/lib/forms";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { categoryPath, orderTree, subtreeIds } from "../lib/categories";
import { useCategoryTree } from "../queries";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";

const ROOT = "root";

type Editing =
  | { mode: "create"; parentId: string | null }
  | { mode: "edit"; category: CategoryNode };

/** The category tree: add (at the top or under a category), rename, move, delete. */
export function CategoryManager() {
  const tree = useCategoryTree();
  const nodes = useMemo(() => tree.data ?? [], [tree.data]);
  const ordered = useMemo(() => orderTree(nodes), [nodes]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<CategoryNode | null>(null);

  const remove = useAdminMutation({
    mutationFn: async (category: CategoryNode) => {
      await adminDeleteCategory({
        path: { id: category.id },
        throwOnError: true,
      });
    },
    success: (_, c) => `${c.name} was deleted`,
    failure: "Couldn't delete the category.",
    onSuccess: () => setDeleting(null),
  });

  const childCount = (id: string) =>
    nodes.filter((n) => n.parent_id === id).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {tree.isSuccess &&
            `${nodes.length} ${nodes.length === 1 ? "category" : "categories"}`}
        </p>
        <Button onClick={() => setEditing({ mode: "create", parentId: null })}>
          <PlusIcon data-icon="inline-start" />
          Add category
        </Button>
      </div>

      <div className="overflow-hidden rounded-panel border border-border bg-card">
        {tree.isPending ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : tree.isError ? (
          <div className="p-8 text-sm text-muted-foreground">
            The categories couldn&apos;t load.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => tree.refetch()}
            >
              Try again
            </button>
          </div>
        ) : ordered.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <TreeStructureIcon
              className="mx-auto size-8 text-muted-foreground"
              weight="light"
            />
            <p className="mt-4 font-serif text-2xl">No categories yet.</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Every product sits in one; start with the top level, like
              Clothing.
            </p>
          </div>
        ) : (
          <ul aria-label="Categories" className="divide-y divide-border">
            {ordered.map((category) => (
              <li
                key={category.id}
                className="group flex h-14 items-center justify-between gap-3 pr-3 transition-colors hover:bg-muted/40"
                style={{ paddingLeft: `${1.25 + category.depth * 1.75}rem` }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  {category.depth > 0 && (
                    <span aria-hidden className="h-px w-3 shrink-0 bg-border" />
                  )}
                  <div className="min-w-0">
                    <p
                      className={
                        category.depth === 0
                          ? "truncate font-serif text-xl leading-tight"
                          : "truncate text-[0.8125rem]"
                      }
                    >
                      {category.name}
                      {category.parent_id && (
                        <span className="sr-only">
                          , in {categoryPath(nodes, category.parent_id)}
                        </span>
                      )}
                    </p>
                    <p className="truncate font-mono text-[0.625rem] text-muted-foreground">
                      /{category.slug}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden sm:inline-flex sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                    onClick={() =>
                      setEditing({ mode: "create", parentId: category.id })
                    }
                  >
                    <PlusIcon data-icon="inline-start" />
                    Subcategory
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={buttonVariants({
                        variant: "ghost",
                        size: "icon-sm",
                      })}
                      aria-label={`Actions for ${category.name}`}
                    >
                      <DotsThreeIcon className="size-5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 p-1">
                      <DropdownMenuItem
                        onClick={() => setEditing({ mode: "edit", category })}
                      >
                        <PencilSimpleIcon />
                        Rename or move
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          setEditing({ mode: "create", parentId: category.id })
                        }
                      >
                        <PlusIcon />
                        Add subcategory
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeleting(category)}
                      >
                        <TrashIcon />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CategoryDialog
        nodes={nodes}
        editing={editing}
        onClose={() => setEditing(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this category?"
        description={
          deleting && (
            <>
              <span className="text-foreground">{deleting.name}</span> is
              removed. Its products stay but lose their category until you
              choose another
              {childCount(deleting.id) > 0 &&
                `, and its ${childCount(deleting.id) === 1 ? "subcategory moves" : `${childCount(deleting.id)} subcategories move`} to the top level`}
              .
            </>
          )
        }
        confirmLabel="Delete category"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function CategoryDialog({
  nodes,
  editing,
  onClose,
}: {
  nodes: CategoryNode[];
  editing: Editing | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const key =
    editing === null
      ? "closed"
      : editing.mode === "edit"
        ? editing.category.id
        : `new-${editing.parentId ?? ROOT}`;
  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => !open && !busy && onClose()}
    >
      <DialogContent className="gap-0 p-0 sm:max-w-md">
        {editing && (
          <CategoryForm
            key={key}
            nodes={nodes}
            editing={editing}
            onBusyChange={setBusy}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  nodes,
  editing,
  onBusyChange,
  onDone,
}: {
  nodes: CategoryNode[];
  editing: Editing;
  onBusyChange: (busy: boolean) => void;
  onDone: () => void;
}) {
  const category = editing.mode === "edit" ? editing.category : null;
  const [name, setName] = useState(category?.name ?? "");
  const [parent, setParent] = useState(
    (category
      ? category.parent_id
      : editing.mode === "create"
        ? editing.parentId
        : null) ?? ROOT,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // A category can't move under itself or anything below it.
  const parents = useMemo(() => {
    const blocked = category
      ? subtreeIds(nodes, category.id)
      : new Set<string>();
    return [
      { value: ROOT, label: "None (top level)", depth: 0 },
      ...orderTree(nodes)
        .filter((n) => !blocked.has(n.id))
        .map((n) => ({
          value: n.id,
          label: categoryPath(nodes, n.id),
          depth: n.depth,
        })),
    ];
  }, [nodes, category]);

  const save = useAdminMutation({
    mutationFn: async (body: { name: string; parent_id?: string }) => {
      if (category) {
        await adminUpdateCategory({
          path: { id: category.id },
          body,
          throwOnError: true,
        });
      } else {
        await adminCreateCategory({ body, throwOnError: true });
      }
    },
    quietOnFieldErrors: true,
    failure: "Couldn't save the category.",
    success: category ? "Category saved" : "Category added",
    onSuccess: () => {
      onBusyChange(false);
      onDone();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = CategoryBodySchema.safeParse({
      name,
      ...(parent !== ROOT && { parent_id: parent }),
    });
    if (!parsed.success) {
      setErrors(friendlyFieldErrors(parsed.error, { name: "a name" }));
      return;
    }
    onBusyChange(true);
    save.mutate(parsed.data, {
      onError: (error) => {
        onBusyChange(false);
        const apiError = getApiError(error);
        if (apiError?.code === "CATEGORY_ALREADY_EXISTS") {
          setErrors({ name: "Another category already has this name" });
        } else {
          setErrors(mapFieldErrors(apiError?.errors));
        }
      },
    });
  }

  const parentName =
    editing.mode === "create" && editing.parentId
      ? categoryPath(nodes, editing.parentId)
      : null;

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader className="gap-1 border-b border-border px-6 py-5">
        <DialogTitle className="font-serif text-2xl font-normal">
          {category
            ? `Edit ${category.name}`
            : parentName
              ? "New subcategory"
              : "New category"}
        </DialogTitle>
        <DialogDescription className="text-xs">
          {category
            ? "Renaming changes its address in the store."
            : parentName
              ? `Inside ${parentName}.`
              : "Names are unique across the store."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-5 px-6 py-6">
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel
            htmlFor="category-name"
            className="eyebrow !text-foreground"
          >
            Name
          </FieldLabel>
          <Input
            id="category-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors({});
            }}
            maxLength={20}
            autoComplete="off"
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError key={errors.name} className="animate-rise">
            {errors.name}
          </FieldError>
        </Field>
        <Field data-invalid={Boolean(errors.parent_id)}>
          <FieldLabel
            htmlFor="category-parent"
            className="eyebrow !text-foreground"
          >
            Parent
          </FieldLabel>
          <Select
            value={parent}
            onValueChange={(value) => value && setParent(value)}
            items={parents}
          >
            <SelectTrigger id="category-parent" className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {parents.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  <span
                    style={{
                      paddingLeft: `${p.value === ROOT ? 0 : p.depth}rem`,
                    }}
                  >
                    {p.value === ROOT ? p.label : p.label.split(" / ").at(-1)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError>{errors.parent_id}</FieldError>
        </Field>
      </div>
      <DialogFooter className="border-t border-border px-6 py-4">
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={save.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Saving…" : category ? "Save" : "Add category"}
        </Button>
      </DialogFooter>
    </form>
  );
}
