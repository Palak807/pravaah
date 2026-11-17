import { useStore } from './store';
import { Header } from './components/Header';
import { RegistersScreen } from './components/registers/RegistersScreen';
import { CheckScreen } from './components/check/CheckScreen';
import { TodayScreen } from './components/forecast/TodayScreen';
import { DischargeListScreen } from './components/discharge/DischargeListScreen';
import { ContactLink } from './components/ContactModal';

export function App() {
  const step = useStore((s) => s.step);
  return (
    <>
      <Header />
      <main id="view" className={step === 3 ? 'full' : undefined}>
        {step === 1 && <RegistersScreen />}
        {step === 2 && <CheckScreen />}
        {step === 3 && <TodayScreen />}
        {step === 4 && <DischargeListScreen />}
      </main>
      {step !== 3 && (
        <footer>
          <span>Demo build. The hospital and patients are invented. The assistant runs on Claude, and every number on screen is computed by the simulation.</span>
          <ContactLink />
        </footer>
      )}
    </>
  );
}
