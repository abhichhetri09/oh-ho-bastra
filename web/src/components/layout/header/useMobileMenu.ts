import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/** Open state for the mobile menu: closes on navigation and Escape, locks page scroll while open. */
export function useMobileMenu() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);

  // Close when the route changes (derived, no effect needed).
  if (open && openedAt !== pathname) {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return {
    open,
    toggle: () => {
      setOpenedAt(pathname);
      setOpen((value) => !value);
    },
    close: () => setOpen(false),
  };
}
