import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { friendlyApiError, type ApiErrorBody } from "@/components/dashboard/api-error-text";

export { friendlyApiError, isDemoLocked, readApiBody, type ApiErrorBody } from "@/components/dashboard/api-error-text";

/**
 * Hook voor client-componenten: `const apiError = useApiError();` en dan
 * `setError(apiError(res.status, data))` of met een eigen terugvaltekst.
 * De regels zelf staan in api-error-text.ts (zonder React, dus testbaar).
 */
export function useApiError() {
  const locale = useLocale();
  const t = useTranslations("appExtra.errors");
  return useCallback(
    (status: number, data: ApiErrorBody, fallback?: string) =>
      friendlyApiError({ status, data, locale, fallback: fallback ?? t("generic"), demoLocked: t("demoLocked") }),
    [locale, t],
  );
}
