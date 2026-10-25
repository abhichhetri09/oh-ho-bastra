/**
 * One block of a settings page: what it is on the left, its controls on the
 * right (stacked on small screens).
 */
export function SettingsSection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="grid scroll-mt-24 gap-5 border-t border-border py-10 first:border-t-0 first:pt-0 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-12"
    >
      <div className="space-y-2 lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-[0.9375rem] font-medium">{title}</h2>
        <div className="text-[0.8125rem] leading-relaxed text-muted-foreground">
          {description}
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
