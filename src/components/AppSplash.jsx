import { useEffect, useState } from 'react';

const SPLASH_SEEN_KEY = 'goyoSplashSeen';
const SPLASH_DURATION_MS = 650;

const shouldShowSplash = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.sessionStorage.getItem(SPLASH_SEEN_KEY) !== 'true';
  } catch {
    return true;
  }
};

export default function AppSplash() {
  const [isVisible, setIsVisible] = useState(shouldShowSplash);

  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        window.sessionStorage.setItem(SPLASH_SEEN_KEY, 'true');
      } catch {
        // Splash visibility can safely fall back to in-memory state.
      }

      setIsVisible(false);
    }, SPLASH_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="app-splash" aria-label="GOYO 시작 화면" role="img">
      <img src="/branding/splash/splash-logo.svg" alt="GOYO" />
    </div>
  );
}
