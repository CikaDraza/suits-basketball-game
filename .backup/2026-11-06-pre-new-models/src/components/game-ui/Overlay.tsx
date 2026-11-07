import { ReactNode } from "react";

interface OverlayProps {
  children: ReactNode;
  transparent?: boolean;
  blur?: boolean;
  className?: string;
}

export function Overlay({
  children,
  transparent,
  blur,
  className = "",
}: OverlayProps) {
  const classes = [
    "overlay",
    transparent ? "overlay--transparent" : "overlay--solid",
    blur && "overlay--blur",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
