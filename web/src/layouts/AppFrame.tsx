import { Outlet } from "react-router-dom";

import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";

export function AppFrame() {
  return (
    <div className="mx-auto flex min-h-svh w-full  flex-col">
      <Header />
      <main className="flex-1 px-6 py-10">
        <Outlet />
      </main>
      <footer className="flex items-center justify-between bg-black px-6 py-4 text-sm text-white/70">
        <Logo mark className="h-8" />
        <span>Bastra</span>
      </footer>
    </div>
  );
}
