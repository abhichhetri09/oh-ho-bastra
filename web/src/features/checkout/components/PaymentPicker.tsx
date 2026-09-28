import { ChoiceGroup } from "@/components/ui/choice-group";
import {
  paymentGroupLabels,
  type PaymentMethod,
  type PaymentMethodGroup,
} from "@/features/checkout/types";

const groups = Object.keys(paymentGroupLabels) as PaymentMethodGroup[];

/** Payment methods grouped like a Paytrail checkout: bank, mobile, card, pay later. */
export function PaymentPicker({
  methods,
  value,
  onChange,
}: {
  methods: PaymentMethod[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Test mode — no money moves. You will approve or cancel the payment on the next screen.
      </p>
      {groups.map((group) => {
        const inGroup = methods.filter((method) => method.group === group);
        return inGroup.length === 0 ? null : (
          <div key={group} className="space-y-3">
            <p className="text-sm font-medium">{paymentGroupLabels[group]}</p>
            <ChoiceGroup
              name="paymentMethod"
              value={value}
              onChange={onChange}
              className="grid grid-cols-2 sm:grid-cols-3 [&>label]:h-12"
              choices={inGroup.map((method) => ({ value: method.id, label: method.name }))}
            />
          </div>
        );
      })}
    </>
  );
}
