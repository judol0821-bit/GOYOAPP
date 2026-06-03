import { NavLink } from 'react-router-dom';

const navItems = [
  { icon: 'home', label: '홈', path: '/home' },
  { icon: 'calendar', label: '캘린더', path: '/calendar' },
  { icon: 'my', label: '마이', path: '/my' },
];

export default function BottomNav() {
  return (
    <nav className="ds-bottom-nav" aria-label="main navigation">
      {navItems.map((item) => (
        <NavLink className="ds-bottom-nav__item" key={item.path} to={item.path}>
          <span className={`ds-bottom-nav__icon ds-bottom-nav__icon--${item.icon}`} aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
