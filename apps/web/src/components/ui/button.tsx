import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        light:
          'rounded-md bg-foreground text-background hover:bg-foreground/90',
        secondary:
          'border border-border bg-surface text-foreground hover:bg-white/10',
        ghost: 'text-foreground hover:bg-white/10',
        header:
          'text-foreground hover:bg-white/10 disabled:text-muted-foreground disabled:opacity-100',
        control:
          'border border-white/30 bg-background/90 text-foreground hover:border-primary hover:bg-surface hover:text-primary focus-visible:border-primary focus-visible:bg-surface focus-visible:text-primary disabled:border-border disabled:bg-surface disabled:text-muted-foreground disabled:opacity-100',
      },
      size: {
        default: 'px-5',
        icon: 'size-12 min-w-12 shrink-0 p-0 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:stroke-2',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
