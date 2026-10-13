import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function NotFoundView() {
  return (
    <div className="container-page flex flex-1 flex-col items-center justify-center py-24 text-center">
      <p className="eyebrow animate-rise">Error 404</p>
      <h1
        className="display animate-rise mt-4 text-[clamp(4rem,14vw,11rem)] text-foreground/90"
        style={{ "--i": 1 } as React.CSSProperties}
      >
        Lost, <em>beautifully.</em>
      </h1>
      <p
        className="animate-rise mt-6 max-w-md text-sm text-muted-foreground"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        This page has moved on, or never existed. The rest of the shop is right
        where you left it.
      </p>
      <div
        className="animate-rise mt-10 flex flex-wrap justify-center gap-3"
        style={{ "--i": 3 } as React.CSSProperties}
      >
        <Link href="/shop" className={buttonVariants({ size: "lg" })}>
          Continue shopping
        </Link>
        <Link
          href="/"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          Home
        </Link>
      </div>
    </div>
  );
}
