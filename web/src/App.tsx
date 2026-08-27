import { Route, Routes } from "react-router-dom";

import { AppFrame } from "@/layouts/AppFrame";
import { About } from "@/pages/About";
import { Account } from "@/pages/Account";
import { Cart } from "@/pages/Cart";
import { Collection } from "@/pages/Collection";
import { Contact } from "@/pages/Contact";
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
        <Route path="/collections/:slug" element={<Collection />} />
        <Route path="/products/:slug" element={<Product />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
