import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";

function ScrollToHash() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      document.querySelector(hash)?.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}

export function AppFrame() {
  return (
    <div className="flex min-h-svh w-full flex-col">
      <ScrollToHash />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
