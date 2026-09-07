// Template her-mount bij elke navigatie (in tegenstelling tot layout) —
// daardoor krijgt iedere pagina een subtiele entree-animatie. De animatie
// eindigt op transform:none, dus fixed/sticky elementen blijven correct;
// prefers-reduced-motion wordt globaal gerespecteerd (globals.css).
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-enter">{children}</div>;
}
