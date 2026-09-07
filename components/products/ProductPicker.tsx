"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select";

export interface PickedProduct {
  name: string;
  description: string | null;
  unitPrice: number;
  vatRate: number;
  unit: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  description: string | null;
  unitPrice: string | number;
  vatRate: string | number;
  unit: string | null;
}

/**
 * "Uit catalogus…"-keuzelijst voor factuur-/offerteformulieren: kies een
 * product of dienst en de regel wordt ingevuld. Rendert niets zolang de
 * catalogus leeg is (geen ruis voor wie 'm niet gebruikt).
 */
export function ProductPicker({ onPick, className }: { onPick: (p: PickedProduct) => void; className?: string }) {
  const t = useTranslations("products");
  const [products, setProducts] = useState<ProductRow[]>([]);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: ProductRow[]) => setProducts(list))
      .catch(() => {});
  }, []);

  if (products.length === 0) return null;

  return (
    <Select
      className={className ?? "w-56"}
      value=""
      placeholder={t("pickerPlaceholder")}
      ariaLabel={t("pickerPlaceholder")}
      onChange={(id) => {
        const p = products.find((x) => x.id === id);
        if (p) onPick({ name: p.name, description: p.description, unitPrice: Number(p.unitPrice), vatRate: Number(p.vatRate), unit: p.unit });
      }}
      options={products.map((p) => ({ value: p.id, label: `${p.name} · € ${Number(p.unitPrice).toFixed(2)}` }))}
    />
  );
}
