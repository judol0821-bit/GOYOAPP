const variantClassNames = {
  primary: 'ds-button--primary',
  secondary: 'ds-button--secondary',
  ghost: 'ds-button--ghost',
  danger: 'ds-button--danger',
};

const sizeClassNames = {
  sm: 'ds-button--sm',
  md: 'ds-button--md',
  lg: 'ds-button--lg',
};

export default function Button({
  children,
  className = '',
  disabled = false,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}) {
  const buttonClassName = [
    'ds-button',
    variantClassNames[variant] || variantClassNames.primary,
    sizeClassNames[size] || sizeClassNames.md,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={buttonClassName} disabled={disabled} type={type} {...props}>
      {children}
    </button>
  );
}
