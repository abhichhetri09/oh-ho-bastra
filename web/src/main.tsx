import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { CartProvider } from "@/lib/cart";
import { FlyToBagProvider } from "@/lib/fly-to-bag";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <CartProvider>
        <FlyToBagProvider>
          <App />
        </FlyToBagProvider>
      </CartProvider>
    </BrowserRouter>
  </StrictMode>,
);
