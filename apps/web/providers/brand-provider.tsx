"use client";

import { createContext, useContext } from "react";

const LogoContext = createContext<string | null>(null);

/**
 * The store's uploaded logo (Admin → Settings → Appearance), read on the
 * server from the cached settings; null for the built-in mark. A save in
 * the admin refreshes the layout, and with it the logo.
 */
export function BrandProvider({
  logo,
  children,
}: {
  logo: string | null;
  children: React.ReactNode;
}) {
  return <LogoContext.Provider value={logo}>{children}</LogoContext.Provider>;
}

export function useStoreLogo(): string | null {
  return useContext(LogoContext);
}
