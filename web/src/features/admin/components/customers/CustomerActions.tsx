import { useState } from "react";

import { Ban, LogOut, ShieldCheck, User } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { FormField } from "@/components/ui/form-field";
import { useUserActions } from "@/features/admin/api";
import { ConfirmAction } from "@/components/ui/confirm-action";
import type { AdminUser } from "@/features/admin/types";

const durations = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "forever", label: "Permanent" },
];

export function CustomerActions({ user }: { user: AdminUser }) {
  const actions = useUserActions(user.id);
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState("forever");
  const isAdmin = user.role === "admin";

  if (user.isSelf) {
    return <p className="text-sm text-muted-foreground">This is you. Other admins can manage your account.</p>;
  }

  return (
    <>
      <ConfirmAction
        trigger={
          <>
            {isAdmin ? <User /> : <ShieldCheck />}
            {isAdmin ? "Remove admin" : "Make admin"}
          </>
        }
        title={isAdmin ? `Remove admin access from ${user.name}?` : `Make ${user.name} an admin?`}
        description={
          isAdmin
            ? "They keep their account and orders, but lose access to this dashboard."
            : "They will be able to see every order and customer, change products and settings, and manage other admins."
        }
        confirmLabel={isAdmin ? "Remove admin" : "Make admin"}
        pending={actions.setRole.isPending}
        error={actions.setRole.error?.message}
        onConfirm={() => actions.setRole.mutateAsync(isAdmin ? "customer" : "admin")}
      />

      <ConfirmAction
        trigger={
          <>
            <LogOut />
            Sign out everywhere
          </>
        }
        title="Sign this user out on every device?"
        description="Their account stays active; they just need to sign in again."
        confirmLabel="Sign out"
        pending={actions.revokeSessions.isPending}
        error={actions.revokeSessions.error?.message}
        onConfirm={() => actions.revokeSessions.mutateAsync()}
      />

      {user.banned ? (
        <Button variant="outline" onClick={() => actions.unban.mutate()} disabled={actions.unban.isPending}>
          Lift ban
        </Button>
      ) : (
        <ConfirmAction
          tone="destructive"
          trigger={
            <>
              <Ban />
              Ban
            </>
          }
          title={`Ban ${user.name}?`}
          description="They are signed out right away and can’t sign in until the ban ends. Their past orders stay."
          confirmLabel="Ban user"
          pending={actions.ban.isPending}
          error={actions.ban.error?.message}
          onConfirm={() =>
            actions.ban.mutateAsync({
              reason: reason.trim() || undefined,
              days: duration === "forever" ? undefined : Number(duration),
            })
          }
        >
          <FormField
            id="ban-reason"
            label="Reason (shown to other admins)"
            placeholder="Repeated chargebacks"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="space-y-2">
            <p className="text-sm font-medium">Duration</p>
            <ChoiceGroup name="ban-duration" value={duration} onChange={setDuration} choices={durations} className="[&>label]:h-9" />
          </div>
        </ConfirmAction>
      )}
    </>
  );
}
