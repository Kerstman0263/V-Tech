import { HttpError } from "@/lib/http-error";

/**
 * Een factuur die volgens de btw- of KOR-regels zo niet gemaakt mag worden (422).
 * Eigen module, zodat periodieke facturen en offertes de fout herkennen zonder
 * de hele factuurlogica te laden.
 */
export type InvoiceRuleCode = "kor_vat" | "kor_threshold" | "vat_scheme";

export class InvoiceRuleError extends HttpError {
  constructor(message: string, public code: InvoiceRuleCode) {
    super(422, message);
  }
}
