import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { AppRoutes } from "@/app/AppRoutes";
import { Providers } from "@/app/Providers";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <AppRoutes />
    </Providers>
  </StrictMode>,
);
