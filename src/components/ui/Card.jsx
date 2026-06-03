const variantClassNames = {
  default: 'ds-card--default',
  elevated: 'ds-card--elevated',
  muted: 'ds-card--muted',
};

export default function Card({ as: Component = 'div', children, className = '', variant = 'default', ...props }) {
  const cardClassName = ['ds-card', variantClassNames[variant] || variantClassNames.default, className]
    .filter(Boolean)
    .join(' ');

  return (
    <Component className={cardClassName} {...props}>
      {children}
    </Component>
  );
}
