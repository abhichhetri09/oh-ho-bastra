import { settingsPage, type SettingsPageId } from "../lib/settings";

/** A settings page's own content, under its heading and one-line description. */
export function SettingsSection({
  page,
  children,
}: {
  page: SettingsPageId;
  children: React.ReactNode;
}) {
  const { label, description } = settingsPage(page);
  return (
    <section aria-labelledby={`settings-${page}`} className="min-w-0">
      <div className="mb-6 space-y-1.5">
        <h2 id={`settings-${page}`} className="text-[0.9375rem] font-medium">
          {label}
        </h2>
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
