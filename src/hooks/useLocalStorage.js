import { useState } from 'react';

export default function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      if (typeof window === 'undefined') {
        return initialValue;
      }

      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value) => {
    setStoredValue((prevValue) => {
      const nextValue = value instanceof Function ? value(prevValue) : value;

      try {
        if (typeof window === 'undefined') {
          return nextValue;
        }

        window.localStorage.setItem(key, JSON.stringify(nextValue));
      } catch {
        return nextValue;
      }

      return nextValue;
    });
  };

  const removeValue = () => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key);
      }
    } finally {
      setStoredValue(initialValue);
    }
  };

  return [storedValue, setValue, removeValue];
}
