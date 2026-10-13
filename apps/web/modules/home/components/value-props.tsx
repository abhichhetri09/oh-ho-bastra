import {
  ArrowCounterClockwiseIcon,
  LeafIcon,
  PackageIcon,
  ShieldCheckIcon,
} from "@phosphor-icons/react/ssr";
import { Stagger, StaggerItem } from "@/components/motion/reveal";
import { site } from "@/lib/site";

const icons = [
  PackageIcon,
  ArrowCounterClockwiseIcon,
  ShieldCheckIcon,
  LeafIcon,
];

export function ValueProps() {
  return (
    <section className="border-y border-border">
      <Stagger className="container-page grid divide-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
        {site.values.map((value, i) => {
          const Icon = icons[i] ?? PackageIcon;
          return (
            <StaggerItem
              key={value.title}
              className="flex gap-4 py-8 lg:px-8 lg:first:pl-0"
            >
              <Icon
                weight="light"
                className="mt-0.5 size-6 shrink-0 text-clay"
              />
              <div className="space-y-1">
                <h3 className="text-sm font-medium">{value.title}</h3>
                <p className="text-[0.8125rem] text-muted-foreground">
                  {value.body}
                </p>
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>
    </section>
  );
}
