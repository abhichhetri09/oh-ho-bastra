import type { SavedAddress } from "@/features/account/types";

export function AddressView({ address }: { address: SavedAddress }) {
  return (
    <address className="space-y-0.5 text-sm not-italic">
      <p className="font-medium">
        {address.firstName} {address.lastName}
      </p>
      <p>{address.street}</p>
      <p>
        {address.postalCode} {address.city}
      </p>
      <p className="text-muted-foreground">{address.phone}</p>
    </address>
  );
}
