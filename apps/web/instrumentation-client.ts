import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./sentry.shared";

Sentry.init(sentryOptions);

// Names client-side navigations in performance traces.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
