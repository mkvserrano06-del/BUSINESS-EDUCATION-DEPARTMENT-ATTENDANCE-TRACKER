export function registerServiceWorker() {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${process.env.PUBLIC_URL}/service-worker.js`).catch((error) => {
        console.warn('Service worker registration failed', error);
      });
    });
  }
}
