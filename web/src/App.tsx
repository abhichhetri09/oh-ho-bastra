import { Route, Routes } from "react-router-dom";

import { AppFrame } from "@/layouts/AppFrame";
import { Account } from "@/pages/Account";
import { Home } from "@/pages/Home";
import { NotFound } from "@/pages/NotFound";
import { Product } from "@/pages/Product";
import { SignIn } from "@/pages/SignIn";
import { SignUp } from "@/pages/SignUp";

export default function App() {
  return (
    <Routes>
      <Route element={<AppFrame />}>
        <Route path="/" element={<Home />} />
        <Route path="/products/:slug" element={<Product />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
