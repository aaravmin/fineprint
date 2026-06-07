import type React from "react";

interface LoadingDotsProps {
  size?: number;
  children?: React.ReactNode;
}

const dots = [
  { animationDelay: "0s" },
  { animationDelay: "0.2s", marginLeft: 2 },
  { animationDelay: "0.4s", marginLeft: 2 },
];

export const LoadingDots = ({ size = 4, children }: LoadingDotsProps) => {
  return (
    <span className="inline-flex items-center">
      {children && <span className="mr-2">{children}</span>}
      {dots.map((dot, index) => (
        <span
          key={index}
          className="inline-block animate-bounce rounded-full bg-current"
          style={{ height: size, width: size, ...dot }}
        />
      ))}
    </span>
  );
};
