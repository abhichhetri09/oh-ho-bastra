import { useState } from "react";

import { useSaveSettings } from "@/features/admin/api";
import type { SettingsSection, StoreSettings } from "@/features/admin/types";

/** Draft of one settings section over the saved value, with dirty tracking and save. */
export function useSettingsForm<K extends SettingsSection>(section: K, saved: StoreSettings[K]) {
  const [draft, setDraft] = useState<StoreSettings[K] | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Bumped on discard/save so uncontrolled inputs remount with the saved value.
  const [version, setVersion] = useState(0);
  const save = useSaveSettings(section);
  const value = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  return {
    value,
    dirty,
    version,
    update: (patch: Partial<StoreSettings[K]>) => {
      setSavedAt(null);
      setDraft({ ...value, ...patch });
    },
    reset: () => {
      setDraft(null);
      setVersion((v) => v + 1);
    },
    save: () =>
      save.mutate(value, {
        onSuccess: () => {
          setDraft(null);
          setSavedAt(Date.now());
          setVersion((v) => v + 1);
        },
      }),
    saving: save.isPending,
    error: save.error?.message ?? null,
    justSaved: savedAt !== null && !dirty,
  };
}

export type SettingsForm<K extends SettingsSection> = ReturnType<typeof useSettingsForm<K>>;
