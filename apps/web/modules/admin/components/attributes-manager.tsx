"use client";

import { useState } from "react";
import { PlusIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import {
  AttributeBodySchema,
  type Attribute,
  type AttributeBody,
  type OptionType,
} from "@repo/types";
import { ConfirmDialog } from "@/components/feedback/confirm-dialog";
import { Button } from "@/components/ui/button";
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
  adminCreateAttribute,
  adminDeleteAttribute,
  adminUpdateAttribute,
} from "@/lib/api/client";
import { getApiError } from "@/lib/api/errors";
import { useAdminMutation } from "../hooks/use-admin-mutation";
import { adminKeys } from "../keys";
import { useAdminAttributes } from "../queries";

type Value = { value: string; hex: string | null };

const typeItems = [
  { value: "text", label: "Text" },
  { value: "color", label: "Colour, with swatches" },
];

/** The first API field error's message, or null. */
const fieldMessage = (err: unknown) =>
  getApiError(err)?.errors?.[0]?.message ?? null;

/**
 * The store's option lists. Each is edited in its own card and saved as a
 * whole; variants already made keep the values they were given.
 */
export function AttributesManager() {
  const lists = useAdminAttributes();
  const [deleting, setDeleting] = useState<Attribute | null>(null);

  const remove = useAdminMutation({
    mutationFn: async (a: Attribute) => {
      await adminDeleteAttribute({
        path: { attributeID: a.id },
        throwOnError: true,
      });
    },
    success: (_, a) => `${a.name} was deleted`,
    failure: "Couldn't delete the option list.",
    invalidate: [adminKeys.attributes()],
    onSuccess: () => setDeleting(null),
  });

  return (
    <div className="space-y-6">
      {lists.isPending ? (
        Array.from({ length: 2 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-panel" />
        ))
      ) : lists.isError ? (
        <div className="rounded-panel border border-border py-16 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            The option lists couldn&apos;t load.
          </p>
          <Button variant="outline" onClick={() => lists.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        lists.data.map((a) => (
          <ListCard
            key={`${a.id}:${a.name}:${a.values.map((v) => v.value).join("|")}`}
            list={a}
            onDelete={() => setDeleting(a)}
          />
        ))
      )}

      <NewList />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this option list?"
        description="New variants can no longer pick from it. Variants already made keep their values."
        confirmLabel="Delete list"
        pending={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

/** One list: its name, type and values, saved together. */
function ListCard({
  list,
  onDelete,
}: {
  list: Attribute;
  onDelete: () => void;
}) {
  const [name, setName] = useState(list.name);
  const [type, setType] = useState<OptionType>(list.type);
  const [values, setValues] = useState<Value[]>(list.values);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== list.name ||
    type !== list.type ||
    JSON.stringify(values) !==
      JSON.stringify(list.values.map((v) => ({ value: v.value, hex: v.hex })));

  const save = useAdminMutation({
    mutationFn: async (body: AttributeBody) => {
      await adminUpdateAttribute({
        path: { attributeID: list.id },
        body,
        throwOnError: true,
      });
    },
    success: "Option list saved",
    failure: "Couldn't save the option list.",
    quietOnFieldErrors: true,
    invalidate: [adminKeys.attributes()],
  });

  function submit() {
    const parsed = AttributeBodySchema.safeParse({ name, type, values });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the list");
      return;
    }
    setError(null);
    save.mutate(parsed.data, { onError: (err) => setError(fieldMessage(err)) });
  }

  return (
    <section className="space-y-4 rounded-panel border border-border p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          aria-label="List name"
          className="h-10 w-full font-medium sm:w-56"
        />
        <TypeSelect value={type} onChange={setType} />
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          onClick={onDelete}
          aria-label={`Delete ${list.name}`}
        >
          <TrashIcon />
        </Button>
      </div>

      <ValueChips
        values={values}
        colour={type === "color"}
        onChange={(v) => {
          setValues(v);
          setError(null);
        }}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      {dirty && (
        <div className="flex gap-2">
          <Button size="sm" onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={save.isPending}
            onClick={() => {
              setName(list.name);
              setType(list.type);
              setValues(list.values);
              setError(null);
            }}
          >
            Discard
          </Button>
        </div>
      )}
    </section>
  );
}

/** A list's values as chips, with an add field (and a swatch for colours). */
function ValueChips({
  values,
  colour,
  onChange,
}: {
  values: Value[];
  colour: boolean;
  onChange: (values: Value[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [hex, setHex] = useState("#000000");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const value = draft.trim();
    if (!value) return;
    if (values.some((v) => v.value.toLowerCase() === value.toLowerCase())) {
      setError(`${value} is already in the list`);
      return;
    }
    onChange([...values, { value, hex: colour ? hex : null }]);
    setDraft("");
    setError(null);
  }

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {values.map((v, i) => (
          <li
            key={v.value}
            className="inline-flex h-8 items-center gap-2 rounded-field border border-border pr-1 pl-3 text-sm"
          >
            {colour && (
              <label className="relative size-3.5 shrink-0 cursor-pointer overflow-hidden rounded-full ring-1 ring-foreground/15">
                <span
                  className="absolute inset-0"
                  style={{ backgroundColor: v.hex ?? "transparent" }}
                />
                <input
                  type="color"
                  value={v.hex ?? "#000000"}
                  onChange={(e) =>
                    onChange(
                      values.map((x, j) =>
                        j === i ? { ...x, hex: e.target.value } : x,
                      ),
                    )
                  }
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label={`Swatch for ${v.value}`}
                />
              </label>
            )}
            {v.value}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="flex size-6 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={`Remove ${v.value}`}
            >
              <XIcon className="size-3" />
            </button>
          </li>
        ))}
        {values.length === 0 && (
          <li className="text-sm text-muted-foreground">No values yet.</li>
        )}
      </ul>
      <div className="flex items-center gap-2">
        {colour && (
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            aria-label="New value's swatch"
            className="h-10 w-10 shrink-0 cursor-pointer rounded-field border border-input bg-transparent p-1"
          />
        )}
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={20}
          placeholder={colour ? "Add a colour, e.g. Olive" : "Add a value"}
          aria-label="New value"
          className="h-10 max-w-64"
        />
        <Button type="button" variant="outline" onClick={add}>
          <PlusIcon data-icon="inline-start" />
          Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function TypeSelect({
  value,
  onChange,
}: {
  value: OptionType;
  onChange: (type: OptionType) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(t) => t && onChange(t as OptionType)}
      items={typeItems}
    >
      <SelectTrigger aria-label="Type" className="h-10 w-full sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {typeItems.map((t) => (
          <SelectItem key={t.value} value={t.value}>
            {t.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A new list: a name and type; values are added in its card after. */
function NewList() {
  const [name, setName] = useState("");
  const [type, setType] = useState<OptionType>("text");
  const [error, setError] = useState<string | null>(null);

  const create = useAdminMutation({
    mutationFn: async (body: AttributeBody) => {
      await adminCreateAttribute({ body, throwOnError: true });
    },
    success: (_, b) => `${b.name} added`,
    failure: "Couldn't add the option list.",
    quietOnFieldErrors: true,
    invalidate: [adminKeys.attributes()],
    onSuccess: () => {
      setName("");
      setType("text");
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = AttributeBodySchema.safeParse({ name, type, values: [] });
    if (!parsed.success) {
      setError("Give it a name of 2 to 20 characters, like Material.");
      return;
    }
    setError(null);
    create.mutate(parsed.data, {
      onError: (err) => setError(fieldMessage(err)),
    });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="space-y-2 rounded-panel border border-dashed border-border p-5"
    >
      <p className="eyebrow !text-foreground">New option list</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          maxLength={20}
          placeholder="e.g. Material"
          aria-label="New list's name"
          className="h-10 w-full sm:w-56"
        />
        <TypeSelect value={type} onChange={setType} />
        <Button type="submit" className="h-10" disabled={create.isPending}>
          <PlusIcon data-icon="inline-start" />
          {create.isPending ? "Adding…" : "Add list"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
