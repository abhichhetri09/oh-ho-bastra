import { useRoutes, type RouteObject } from "react-router-dom";

import { AppFrame } from "@/components/layout/AppFrame";
import { AccountShell } from "@/features/account/AccountShell";
import { AccountAddress } from "@/pages/account/Address";
import { AccountOrderDetail } from "@/pages/account/OrderDetail";
import { AccountOrders } from "@/pages/account/Orders";
import { AccountOverview } from "@/pages/account/Overview";
import { AccountProfile } from "@/pages/account/Profile";
import { SignIn } from "@/pages/account/SignIn";
import { SignUp } from "@/pages/account/SignUp";
import { AppNotFound } from "@/components/app-shell/AppNotFound";
import { AdminShell } from "@/features/admin/AdminShell";
import { CustomerDetail } from "@/pages/admin/CustomerDetail";
import { Customers } from "@/pages/admin/Customers";
import { Dashboard } from "@/pages/admin/Dashboard";
import { OrderDetail as AdminOrderDetail } from "@/pages/admin/OrderDetail";
import { Orders as AdminOrders } from "@/pages/admin/Orders";
import { ProductEdit } from "@/pages/admin/ProductEdit";
import { ProductNew } from "@/pages/admin/ProductNew";
import { Products as AdminProducts } from "@/pages/admin/Products";
import { Settings } from "@/pages/admin/Settings";
import { Cart } from "@/pages/checkout/Cart";
import { Checkout } from "@/pages/checkout/Checkout";
import { Order } from "@/pages/checkout/Order";
import { Pay } from "@/pages/checkout/Pay";
import { NotFound } from "@/pages/NotFound";
import { About } from "@/pages/shop/About";
import { Collection } from "@/pages/shop/Collection";
import { Contact } from "@/pages/shop/Contact";
import { Home } from "@/pages/shop/Home";
import { Product } from "@/pages/shop/Product";

const routes: RouteObject[] = [
  {
    element: <AppFrame />,
    children: [
      // Shop
      { path: "/", element: <Home /> },
      { path: "/collections/:slug", element: <Collection /> },
      { path: "/products/:slug", element: <Product /> },
      { path: "/about", element: <About /> },
      { path: "/contact", element: <Contact /> },
      // Bag, checkout, payment, receipt
      { path: "/cart", element: <Cart /> },
      { path: "/checkout", element: <Checkout /> },
      { path: "/pay/:paymentId", element: <Pay /> },
      { path: "/orders/:orderId", element: <Order /> },
      // Account
      { path: "/sign-in", element: <SignIn /> },
      { path: "/sign-up", element: <SignUp /> },
      { path: "*", element: <NotFound /> },
    ],
  },
  // Account and admin are app-style areas: sidebar layout, no storefront header or footer.
  {
    path: "/account",
    element: <AccountShell />,
    children: [
      { index: true, element: <AccountOverview /> },
      { path: "orders", element: <AccountOrders /> },
      { path: "orders/:orderId", element: <AccountOrderDetail /> },
      { path: "address", element: <AccountAddress /> },
      { path: "profile", element: <AccountProfile /> },
      { path: "*", element: <AppNotFound home="/account" label="your account" /> },
    ],
  },
  {
    path: "/admin",
    element: <AdminShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "orders", element: <AdminOrders /> },
      { path: "orders/:orderId", element: <AdminOrderDetail /> },
      { path: "products", element: <AdminProducts /> },
      { path: "products/new", element: <ProductNew /> },
      { path: "products/:slug", element: <ProductEdit /> },
      { path: "customers", element: <Customers /> },
      { path: "customers/:userId", element: <CustomerDetail /> },
      { path: "settings", element: <Settings /> },
      { path: "settings/:section", element: <Settings /> },
      { path: "*", element: <AppNotFound home="/admin" label="the dashboard" /> },
    ],
  },
];

export function AppRoutes() {
  return useRoutes(routes);
}
