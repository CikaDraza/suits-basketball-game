import type { ComponentProps } from 'react';

export type OverlayProps = ComponentProps<'div'> & {
  transparent?: boolean;
  blur?: boolean;
};

export function Overlay({ transparent, blur, className = '', ...props }: OverlayProps) {
  const classes = [
    'overlay',
    transparent ? 'overlay--transparent' : 'overlay--solid',
    blur && 'overlay--blur',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <div {...props} className={classes} />;
}
