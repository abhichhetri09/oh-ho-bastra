import logo from "@/assets/brand/logo-white-trim.png";
import { cn } from "@/lib/utils";

/** The white logo on a black tile, matching the storefront header. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md bg-black px-2 py-1.5", className)}>
      <img src={logo} alt="Oh Ho" className="h-5 w-auto" />
    </span>
  );
}
