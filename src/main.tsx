import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { CityProvider } from './contexts/CityContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <CityProvider>
    <App />
  </CityProvider>
);
