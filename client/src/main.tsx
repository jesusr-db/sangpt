import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { initFrontendTracing } from './tracing';

// Initialize frontend tracing (non-blocking)
initFrontendTracing().catch(() => {
  // Silently ignore - tracing is optional
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Failed to find the root element with ID "root"');
}

ReactDOM.createRoot(rootElement).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
