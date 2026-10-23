import { Mail, ShieldCheck } from "@/components/icons";
import { Panel } from "@/components/app-shell/Panel";

const names: Record<string, { label: string; detail: string }> = {
  credential: { label: "Email and password", detail: "Sign in with your email address and password." },
  google: { label: "Google", detail: "Sign in with your Google account." },
};

export function SignInMethods({ providers }: { providers: string[] }) {
  return (
    <Panel title="Sign-in methods" flush>
      <ul className="divide-y">
        {providers.map((provider) => {
          const info = names[provider] ?? { label: provider, detail: "" };
          const Icon = provider === "credential" ? Mail : ShieldCheck;
          return (
            <li key={provider} className="flex items-center gap-3 px-4 py-3 text-sm sm:px-5">
              <Icon className="size-4 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">{info.label}</p>
                {info.detail ? <p className="text-xs text-muted-foreground">{info.detail}</p> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
