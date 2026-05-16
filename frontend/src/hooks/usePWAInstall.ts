import { useState, useEffect, useCallback } from 'react';
import { subscribe, getPrompt, clearPrompt, isStandalone } from '../lib/pwa';

export function usePWAInstall() {
  const [canInstall, setCanInstall] = useState(
    () => getPrompt() !== null && !isStandalone(),
  );
  const [installed, setInstalled] = useState(() => isStandalone());

  useEffect(() => {
    return subscribe(() => {
      setCanInstall(getPrompt() !== null && !isStandalone());
    });
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    const prompt = getPrompt();
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    clearPrompt();
    setCanInstall(false);
    if (outcome === 'accepted') setInstalled(true);
    return outcome === 'accepted';
  }, []);

  return { canInstall, installed, install };
}
