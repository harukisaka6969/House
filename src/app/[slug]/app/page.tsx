import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import Dashboard from "@/components/Dashboard";

export default async function AppPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session || session.slug !== slug) redirect(`/${slug}`);

  return <Dashboard slug={slug} />;
}
