import { Link } from "react-router-dom";

import { BrandMark } from "./BrandMark";
import { SidebarNav } from "./SidebarNav";
import type { ShellConfig } from "./types";
import { UserMenu } from "./UserMenu";

export function Sidebar({ config, onNavigate }: { config: ShellConfig; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 bg-sidebar px-3 py-4">
      <Link to={config.home} onClick={onNavigate} className="flex items-center gap-2 px-3 py-1">
        <BrandMark />
        <span className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {config.label}
        </span>
      </Link>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav sections={config.sections} label={config.label} onNavigate={onNavigate} />
      </div>
      <div className="border-t pt-3">
        <UserMenu />
      </div>
    </div>
  );
}
