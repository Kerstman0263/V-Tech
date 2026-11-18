import { useEffect, useState } from "react";

/**
 * Kleine afspraak tussen de zwevende elementen onderaan het scherm op een
 * telefoon (installatiemelding, update-melding en de hulpknop). Ze staan allemaal
 * net boven de tabbalk; tegelijk zouden ze elkaar overlappen.
 *
 * Een melding meldt zich aan zolang hij zichtbaar is. De hulpknop verbergt zich
 * op een telefoon zolang er een melding staat, en de installatiemelding wacht tot
 * de update-melding weg is. Op <body> staat dan ook `data-floating-notice`, voor
 * wie het in CSS wil gebruiken.
 */

const EVENT = "saldova:floating-notice";
const visible = new Set<string>();

export function setFloatingNotice(id: string, isVisible: boolean): void {
  if (typeof window === "undefined") return;
  const had = visible.has(id);
  if (isVisible === had) return;
  if (isVisible) visible.add(id);
  else visible.delete(id);
  document.body.toggleAttribute("data-floating-notice", visible.size > 0);
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** Staat er nu een zwevende melding (eventueel: een andere dan `except`)? */
export function useFloatingNotice(except?: string): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = () => setActive([...visible].some((id) => id !== except));
    update();
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, [except]);
  return active;
}
