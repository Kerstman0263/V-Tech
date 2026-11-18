"use client";

import { createContext, useContext } from "react";

/**
 * Lanceerstatus voor clientcomponenten. De server bepaalt hem met isLaunched() uit lib/company.ts
 * (MOLLIE_API_KEY bestaat alleen op de server) en geeft hem in app/[locale]/layout.tsx door.
 * Servercomponenten roepen isLaunched() gewoon zelf aan.
 */
const LaunchStatusContext = createContext(false);

export function LaunchStatusProvider({ launched, children }: { launched: boolean; children: React.ReactNode }) {
  return <LaunchStatusContext.Provider value={launched}>{children}</LaunchStatusContext.Provider>;
}

/** true zodra Saldova gelanceerd is: dan verdwijnen de "nog niet gelanceerd"-teksten. */
export function useIsLaunched(): boolean {
  return useContext(LaunchStatusContext);
}
