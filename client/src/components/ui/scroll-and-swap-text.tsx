"use client";

import { useRef } from "react";

import { motion, useScroll, useTransform } from "framer-motion";

import { cn } from "@/lib/utils";

interface ScrollAndSwapTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  /** Scroll container; omit to track window scroll. */
  containerRef?: React.RefObject<HTMLElement | null>;
  offset?: [string, string];
  className?: string;
}

const ScrollAndSwapText = ({
  label,
  offset = ["0 0", "0 1"],
  className,
  containerRef,
  ...props
}: ScrollAndSwapTextProps) => {
  const ref = useRef<HTMLSpanElement>(null);

  const { scrollYProgress } = useScroll({
    ...(containerRef ? { container: containerRef as React.RefObject<HTMLElement> } : {}),
    target: ref,
    // framer-motion doesn't export the offset tuple type, so we cast
    offset: offset as never,
  });

  const top = useTransform(scrollYProgress, [0, 1], ["0%", "-100%"]);
  const bottom = useTransform(scrollYProgress, [0, 1], ["100%", "0%"]);

  return (
    <span
      className={cn(
        "relative flex items-center justify-center overflow-hidden p-0",
        className,
      )}
      ref={ref}
      {...props}
    >
      <span className="relative text-transparent" aria-hidden="true">
        {label}
      </span>
      <motion.span className="absolute" style={{ top }}>
        {label}
      </motion.span>
      <motion.span className="absolute" style={{ top: bottom }} aria-hidden="true">
        {label}
      </motion.span>
    </span>
  );
};

export { ScrollAndSwapText };
