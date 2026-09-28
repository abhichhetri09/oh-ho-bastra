import { InfoBlock } from "@/components/common/InfoBlock";
import { useCheckoutLabels } from "@/features/checkout/api";
import type { OrderAddress } from "@/features/orders/types";

export function ShippingAddress({ address, title = "Delivery" }: { address: OrderAddress; title?: string }) {
  const labels = useCheckoutLabels();
  return (
    <InfoBlock title={title}>
      <p>
        {address.firstName} {address.lastName}
      </p>
      <p>{address.street}</p>
      <p>
        {address.postalCode} {address.city}, {address.country}
      </p>
      <p className="text-muted-foreground">{labels.shipping(address.shippingMethod)}</p>
    </InfoBlock>
  );
}
