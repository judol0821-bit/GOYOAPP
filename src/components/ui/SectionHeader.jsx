export default function SectionHeader({ actionText, onAction, subtitle, title }) {
  return (
    <div className="ds-section-header">
      <div className="ds-section-header__copy">
        <h2 className="ds-section-header__title">{title}</h2>
        {subtitle && <p className="ds-section-header__subtitle">{subtitle}</p>}
      </div>

      {actionText && (
        <button className="ds-section-header__action" type="button" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
}
