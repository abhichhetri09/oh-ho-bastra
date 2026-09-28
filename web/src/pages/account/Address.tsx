import { useState } from "react";

import { AppPage } from "@/components/app-shell/AppPage";
import { QueryView } from "@/components/feedback/QueryView";
import { Button } from "@/components/ui/button";
import { useDeleteAddress, useSavedAddress } from "@/features/account/api";
import { Panel } from "@/components/app-shell/Panel";
import { AddressForm } from "@/features/account/components/AddressForm";
import { AddressView } from "@/features/account/components/AddressView";
import type { SavedAddress } from "@/features/account/types";

export function AccountAddress() {
  return (
    <AppPage
      title="Address"
      description="We fill this in at checkout. You can still change it for any order."
    >
      <QueryView query={useSavedAddress()}>
        {(address) => <AddressCard address={address} />}
      </QueryView>
    </AppPage>
  );
}

function AddressCard({ address }: { address: SavedAddress | null }) {
  const [editing, setEditing] = useState(address === null);
  const remove = useDeleteAddress();

  return (
    <Panel
      title="Delivery address"
      actions={
        address && !editing ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                remove.mutate(undefined, { onSuccess: () => setEditing(true) })
              }
              disabled={remove.isPending}
            >
              Remove
            </Button>
          </div>
        ) : null
      }
    >
      {editing || !address ? (
        <AddressForm initial={address} onDone={() => setEditing(false)} />
      ) : (
        <AddressView address={address} />
      )}
    </Panel>
  );
}
