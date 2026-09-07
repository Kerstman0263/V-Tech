import { DesktopChrome } from "@/components/desktop/DesktopChrome";

// Auth-pagina's (login/registratie): in de desktop-app is het venster
// randloos, dus hier een sleepstrook bovenaan zodat het venster ook op
// deze schermen versleepbaar is. In de browser rendert dit niets.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DesktopChrome />
      {children}
    </>
  );
}
