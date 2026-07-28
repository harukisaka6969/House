import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import QuickEntry from "@/components/QuickEntry";
import AppGate from "@/components/AppGate";

export default async function QuickPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session || session.slug !== slug) redirect(`/${slug}`);

  return (
    <AppGate slug={slug}>
      <QuickEntry slug={slug} standalone />
    </AppGate>
  );
}
