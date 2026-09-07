import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// Strikte admin-guard: niet-admins worden weggestuurd naar het dashboard.
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const session = await auth();
  const { locale } = await params;

  if (!session?.user) redirect(`/${locale}/login`);
  if (session.user.role !== "ADMIN" && session.user.role !== "OWNER") redirect(`/${locale}/invoices`);

  return <>{children}</>;
}
