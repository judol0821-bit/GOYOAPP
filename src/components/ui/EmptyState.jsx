export default function EmptyState({ action, description, title }) {
  return (
    <section className="ds-empty-state" aria-label="empty state">
      <h2 className="ds-empty-state__title">{title}</h2>
      {description && <p className="ds-empty-state__description">{description}</p>}
      {action}
    </section>
  );
}
