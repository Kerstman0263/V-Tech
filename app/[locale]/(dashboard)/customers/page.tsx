import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { CustomerForm } from "@/components/customers/CustomerForm";

export default async function CustomersPage() {
  const t = await getTranslations("customers");
  const session = await auth();

  const customers = await db.customer.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="mb-2 text-2xl font-bold">{t("title")}</h1>
      </div>

      <CustomerForm />

      {customers.length === 0 ? (
        <p className="text-gray-500">{t("empty")}</p>
      ) : (
        <ul className="max-w-xl divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {customers.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium">{c.name}</span>
              <span className="text-sm text-gray-500">{c.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
