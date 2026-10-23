import { Check, Close } from "@/components/icons";
import { Button } from "@/components/ui/button";
import type { MockOutcome } from "@/features/payments/types";

const actions: {
  outcome: MockOutcome;
  label: string;
  variant: "default" | "outline" | "ghost";
  icon?: typeof Check;
}[] = [
  { outcome: "paid", label: "Approve payment", variant: "default", icon: Check },
  { outcome: "cancelled", label: "Cancel and return to shop", variant: "outline", icon: Close },
  { outcome: "failed", label: "Simulate a declined payment", variant: "ghost" },
];

export function MockPaymentActions({
  onChoose,
  disabled,
}: {
  onChoose: (outcome: MockOutcome) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {actions.map(({ outcome, label, variant, icon: Icon }) => (
        <Button
          key={outcome}
          variant={variant}
          className={variant === "ghost" ? "text-muted-foreground" : undefined}
          onClick={() => onChoose(outcome)}
          disabled={disabled}
        >
          {Icon ? <Icon /> : null}
          {label}
        </Button>
      ))}
    </div>
  );
}
