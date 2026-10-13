import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchCurrentUser, sessionExpiredPath } from "@/lib/auth/session";
import { AccountSettings } from "@/modules/account/components/account-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await fetchCurrentUser();
  if (!user) redirect(sessionExpiredPath("/account/settings"));
  return <AccountSettings user={user} />;
}
