import { BrandLoader } from "@/components/ui/BrandLoader";

// Volledig-scherm loader voor de inlog- en registratieschermen.
// Bewust niet meer op app/[locale]/loading.tsx: een loader op dat niveau laat
// de pagina al streamen voordat notFound() loopt, waardoor onbekende URL's een
// 200 gaven in plaats van een echte 404. Het dashboard heeft een eigen loader.
export default function AuthLoading() {
  return <BrandLoader fullScreen />;
}
