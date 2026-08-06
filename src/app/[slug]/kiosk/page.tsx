import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import KioskDashboard from "@/components/KioskDashboard";
import AppGate from "@/components/AppGate";

export default async function KioskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session || session.slug !== slug) redirect(`/${slug}`);
  if (session.role !== "owner") redirect(`/${slug}/app`);

  return (
    <AppGate slug={slug}>
      <KioskDashboard slug={slug} exitHref={`/${slug}/app`} />
    </AppGate>
  );
}
