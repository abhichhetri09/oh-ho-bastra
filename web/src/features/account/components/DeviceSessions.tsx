import { Loading } from "@/components/feedback/QueryView";
import { Device } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { useDeviceSessions, useRevokeOtherSessions, useRevokeSession } from "@/features/account/api";
import { authClient } from "@/features/auth/auth-client";
import { formatDateTime } from "@/lib/format";
import { deviceLabel } from "@/lib/user-agent";
import { Panel } from "@/components/app-shell/Panel";

export function DeviceSessions() {
  const { data: sessions, isPending } = useDeviceSessions();
  const { data: current } = authClient.useSession();
  const revoke = useRevokeSession();
  const revokeOthers = useRevokeOtherSessions();
  const currentToken = current?.session.token;
  const others = sessions?.filter((s) => s.token !== currentToken) ?? [];

  return (
    <Panel
      title="Signed-in devices"
      description="Sign out anywhere you don’t recognise."
      flush
      actions={
        others.length > 0 ? (
          <Button variant="outline" size="sm" onClick={() => revokeOthers.mutate()} disabled={revokeOthers.isPending}>
            Sign out other devices
          </Button>
        ) : null
      }
    >
      {isPending ? (
        <div className="p-5">
          <Loading />
        </div>
      ) : (
        <ul className="divide-y">
          {sessions?.map((session) => {
            const isCurrent = session.token === currentToken;
            return (
              <li key={session.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Device className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex items-center gap-2">
                    {deviceLabel(session.userAgent)}
                    {isCurrent ? <StatusPill tone="success">This device</StatusPill> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Signed in {formatDateTime(session.createdAt)}
                    {session.ipAddress ? ` · ${session.ipAddress}` : ""}
                  </p>
                </div>
                {!isCurrent ? (
                  <Button variant="ghost" size="sm" onClick={() => revoke.mutate(session.token)} disabled={revoke.isPending}>
                    Sign out
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
