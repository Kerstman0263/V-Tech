import { notFound } from "next/navigation";

// Vangt elke onbekende URL binnen een taal op (/iets-dat-niet-bestaat, /en/xyz),
// zodat de eigen 404-pagina in app/[locale]/not-found.tsx verschijnt, in de juiste
// taal en met een echte 404-status. Zet daarom geen loading.tsx direct in
// app/[locale]: die laat de pagina al streamen voordat notFound() loopt, en dan
// wordt het een 200.
export default function CatchAllPage() {
  notFound();
}
