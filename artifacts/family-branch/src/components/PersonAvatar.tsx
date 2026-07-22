import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// One avatar system for the whole site. Previously each page had its own
// mix of size, border, and fallback color (a flat neutral gray on the
// dashboard, a muted gray for "everyone but the first" on the home feed,
// brand-tinted everywhere else) -- and two of the four list surfaces never
// rendered an uploaded photo at all, always falling back to initials.
//
// Sizes scale by context, not by page: "sm" for compact nav/inline use,
// "md" for the person-list-row pattern shared by Home/Dashboard/Directory/
// Birthdays, "lg" for tree nodes, "xl" for a profile header. The fallback
// text is deliberately bold and sized to qualify as WCAG "large text"
// (>=14pt bold) -- bg-primary/10 + text-primary alone sits right at ~4.4:1,
// just under the 4.5:1 normal-text minimum, which matters more here than
// on most apps given Olive's grandparent-skewing audience.
const SIZES = {
  xs: { box: "h-5 w-5", border: "border", font: "text-[8px] font-bold" },
  sm: { box: "h-8 w-8", border: "border", font: "text-xs font-bold" },
  md: { box: "h-11 w-11", border: "border-2", font: "text-lg font-bold" },
  lg: { box: "h-16 w-16", border: "border-2", font: "text-2xl font-bold" },
  xl: { box: "h-24 w-24", border: "border-4", font: "text-3xl font-bold" },
} as const;

export type PersonAvatarSize = keyof typeof SIZES;

export function PersonAvatar({
  firstName,
  lastName,
  photoUrl,
  size = "md",
  highlighted = false,
  className,
}: {
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  size?: PersonAvatarSize;
  /** Extra emphasis for a single standout item in a list (e.g. the very next birthday). */
  highlighted?: boolean;
  className?: string;
}) {
  const initials = `${(firstName || "?")[0] ?? "?"}${(lastName || "?")[0] ?? "?"}`.toUpperCase();
  const s = SIZES[size];

  return (
    <Avatar
      className={cn(
        s.box,
        s.border,
        "border-background shadow-sm shrink-0",
        highlighted && "ring-2 ring-primary/40",
        className,
      )}
    >
      <AvatarImage src={photoUrl || undefined} />
      <AvatarFallback className={cn("bg-primary/10 text-primary", s.font)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
