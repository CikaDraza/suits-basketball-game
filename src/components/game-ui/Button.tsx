import type { ComponentProps } from 'react';

export type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
};

/** Native props include accessibility attributes, event types and React 19's ref prop. */
export function Button({
  variant = 'primary',
  size = 'default',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ');
  return <button {...props} type={type} className={classes} />;
}
