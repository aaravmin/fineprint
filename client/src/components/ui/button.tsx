import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils.ts";

const buttonVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent",
  {
    variants: {
      variant: {
        default: "bg-accent text-surface hover:bg-accent/85",
        outline: "border border-edge bg-transparent hover:bg-panel",
        danger: "bg-warn/15 text-warn border border-warn/30 hover:bg-warn/25",
        ok: "bg-ok/15 text-ok border border-ok/30 hover:bg-ok/25",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-7 px-2.5 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
