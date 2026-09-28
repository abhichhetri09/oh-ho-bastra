import { Router } from "express";
import { adminOrders } from "./orders.ts";
import { overview } from "./overview.ts";
import { adminProducts } from "./products.ts";
import { adminSettings } from "./settings.ts";
import { adminUsers } from "./users.ts";

// Mounted behind requireAdmin.
export const admin = Router();

admin.use(overview, adminOrders, adminProducts, adminUsers, adminSettings);
