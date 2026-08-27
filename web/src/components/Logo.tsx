import { cn } from "@/lib/utils";
import logoWhite from "@/assets/brand/logo-white-trim.png";
import markWhite from "@/assets/brand/mark-white.png";

type LogoProps = {
  mark?: boolean;
  className?: string;
};

export function Logo({ mark = false, className }: LogoProps) {
  if (mark) {
    return (
      <img
        src={markWhite}
        alt="Oh Ho"
        className={cn("h-10 w-auto", className)}
      />
    );
  }

  return (
    <img
      src={logoWhite}
      alt="Oh Ho"
      className={cn("h-10 w-auto", className)}
    />
  );
}
