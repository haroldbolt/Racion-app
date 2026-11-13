import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext.tsx';
import { CityProvider } from './contexts/CityContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <CityProvider>
      <App />
    </CityProvider>
  </AuthProvider>
);

