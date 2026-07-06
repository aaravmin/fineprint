import type { ReactNode } from "react";

import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// The shared card-with-header idiom: a compact title, an optional one-line sub,
// and an optional right-aligned action. Keeps every panel on the dashboard
// reading the same way without abstracting the card body itself.
export function SectionCard({
  title,
  titleAside,
  sub,
  action,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  titleAside?: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-1.5 text-base">
              {title}
              {titleAside}
            </CardTitle>
            {sub != null ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
          </div>
          {action != null ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>
      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}

// The recurring "View all ->" affordance in a card header.
export function ActionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground",
        "transition-colors hover:text-foreground",
      )}
    >
      {children}
      <span aria-hidden="true">&rarr;</span>
    </Link>
  );
}
