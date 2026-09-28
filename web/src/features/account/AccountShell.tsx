import { AppShell } from "@/components/app-shell/AppShell";
import type { ShellConfig } from "@/components/app-shell/types";
import { RequireUser } from "@/features/auth/components/RequireUser";
import { useAccountSummary } from "./api";
import { accountLinks } from "./nav";

const [overview, orders, address, profile] = accountLinks;

function useAccountNav(): ShellConfig {
  const { data } = useAccountSummary();
  return {
    label: "Account",
    home: "/account",
    sections: [
      { items: [overview] },
      { title: "Shopping", items: [{ ...orders, badge: data?.inTransit }, address] },
      { title: "Settings", items: [profile] },
    ],
  };
}

function AccountApp() {
  return <AppShell config={useAccountNav()} />;
}

export function AccountShell() {
  return <RequireUser>{() => <AccountApp />}</RequireUser>;
}
