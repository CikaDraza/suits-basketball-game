import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode;
  onClick: () => void;
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "default",
  className = "",
}: ButtonProps) {
  const classes = ["btn", `btn--${variant}`, `btn--${size}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <button onClick={onClick} className={classes}>
      {children}
    </button>
  );
}
