import { useState } from "react";

export function useAppState() {
  const [activeProvider, setActiveProvider] = useState<number>(1);
  const [activeAccount, setActiveAccount] = useState<number | null>(null);

  return {
    activeProvider,
    activeAccount,
    setActiveProvider,
    setActiveAccount,
  };
}
