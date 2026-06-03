const tagLabels = {
  concert: 'CONCERT',
  album: 'ALBUM',
  ticket: 'TICKET',
  festival: 'FESTIVAL',
};

export default function Tag({ className = '', type }) {
  const tagClassName = ['ds-tag', type ? `ds-tag--${type}` : '', className].filter(Boolean).join(' ');

  return <span className={tagClassName}>{tagLabels[type] || String(type || '').toUpperCase()}</span>;
}
