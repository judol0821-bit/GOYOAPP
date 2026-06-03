import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useOutlet } from 'react-router-dom';
import BottomNav from './BottomNav.jsx';

const bottomNavPaths = ['/home', '/calendar', '/my'];

export default function AppShell() {
  const location = useLocation();
  const outlet = useOutlet();
  const showBottomNav = bottomNavPaths.includes(location.pathname);

  return (
    <div className={showBottomNav ? 'app-shell ds-app-shell has-bottom-tabs has-bottom-nav' : 'app-shell ds-app-shell'}>
      <div className="mock-status-bar" aria-hidden="true">
        <span>9:41</span>
        <span>●●●</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="app-page-transition"
          key={location.pathname}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          {outlet}
        </motion.div>
      </AnimatePresence>
      {showBottomNav && <BottomNav />}
    </div>
  );
}
