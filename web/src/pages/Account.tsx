import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient, getSessionUser } from "@/lib/auth-client";

export function Account() {
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();
  const user = getSessionUser(session);

  useEffect(() => {
    if (!isPending && !user) {
      void navigate("/sign-in");
    }
  }, [isPending, user, navigate]);

  async function onSignOut() {
    await authClient.signOut();
    void navigate("/sign-in");
  }

  if (isPending || !user) {
    return <p className="text-muted-foreground">Checking session…</p>;
  }

  return (
    <section className="mx-auto max-w-sm space-y-4">
      <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">
        Account
      </p>
      <Card>
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
