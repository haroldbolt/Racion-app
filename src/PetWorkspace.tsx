import App from './App';
import { CityProvider } from './contexts/CityContext';

export default function PetWorkspace({ onOpenAccount }: { onOpenAccount?: () => void }) {
  return <CityProvider><App onOpenAccount={onOpenAccount} /></CityProvider>;
}
