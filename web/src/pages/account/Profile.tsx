import { AppPage } from "@/components/app-shell/AppPage";
import { Loading } from "@/components/feedback/QueryView";
import { useSignInMethods } from "@/features/account/api";
import { DeviceSessions } from "@/features/account/components/DeviceSessions";
import { PasswordForm } from "@/features/account/components/PasswordForm";
import { ProfileForm } from "@/features/account/components/ProfileForm";
import { SignInMethods } from "@/features/account/components/SignInMethods";
import { useSessionUser } from "@/features/auth/useSessionUser";

export function AccountProfile() {
  const { user } = useSessionUser();
  const { data: accounts, isPending } = useSignInMethods();
  const providers = accounts?.map((a) => a.providerId) ?? [];

  if (!user) return null;
  return (
    <AppPage
      title="Profile & security"
      description="Your name, password and the devices you’re signed in on."
    >
      <div className="space-y-6">
        <ProfileForm user={user} />
        {isPending ? (
          <Loading />
        ) : (
          <PasswordForm hasPassword={providers.includes("credential")} />
        )}
        {providers.length > 0 ? <SignInMethods providers={providers} /> : null}
        <DeviceSessions />
      </div>
    </AppPage>
  );
}
