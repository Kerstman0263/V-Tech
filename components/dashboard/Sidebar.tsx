import { SidebarContent } from "@/components/dashboard/SidebarContent";
import type { Plan } from "@prisma/client";

// Statische sidebar voor desktop. Op telefoon verborgen (md:flex);
// daar neemt de MobileSidebar-drawer het over.
export function Sidebar({
  isAdmin = false,
  isOwner = true,
  canTeam,
  isZzp = true,
  canFinance = true,
  plan = "FREE",
  trialDaysLeft = null,
  hidden = [],
  newKeys = [],
}: {
  isAdmin?: boolean;
  isOwner?: boolean;
  canTeam?: boolean;
  isZzp?: boolean;
  canFinance?: boolean;
  plan?: Plan;
  trialDaysLeft?: number | null;
  hidden?: string[];
  newKeys?: string[];
}) {
  return (
    // sticky + h-screen: de zijbalk blijft staan terwijl de main content
    // meescrolt met de pagina, en scrolt bij een lang menu zelfstandig
    // (de nav binnenin heeft zijn eigen overflow-y-auto).
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/5 bg-gradient-to-b from-ink-900 to-ink-950 p-4 text-slate-300 md:flex">
      {/* anchorIds: alleen hier — de zijbalk-items zijn de ankers van de tour. */}
      <SidebarContent isAdmin={isAdmin} isOwner={isOwner} canTeam={canTeam} isZzp={isZzp} canFinance={canFinance} plan={plan} trialDaysLeft={trialDaysLeft} hidden={hidden} newKeys={newKeys} anchorIds />
    </aside>
  );
}
