import { MockDashboard } from "@/components/landing/MockDashboard";

/** Original CSS product stage, using Saldova's interactive product preview. */
export function HeroVisual() {
  return (
    <div className="saldova-stage relative min-w-0">
      <div className="saldova-stage-orbit" aria-hidden="true" />
      <div className="saldova-stage-light" aria-hidden="true" />
      <div className="saldova-stage-frame"><MockDashboard variant="free" switcher framed /></div>
    </div>
  );
}
