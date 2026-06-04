import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles/global.css';
import './styles.css';

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    })
    .catch((error) => {
      console.warn('Failed to unregister development service worker.', error);
    });
}

if (import.meta.env.DEV) {
  window.addEventListener('error', (event) => {
    console.error('GOYO runtime error.', event.error || event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('GOYO unhandled promise rejection.', event.reason);
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
