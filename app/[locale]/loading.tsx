import { BrandLoader } from "@/components/ui/BrandLoader";

// Volledig-scherm loader voor publieke pagina's (landing, about, contact, auth).
export default function LocaleLoading() {
  return <BrandLoader fullScreen />;
}
