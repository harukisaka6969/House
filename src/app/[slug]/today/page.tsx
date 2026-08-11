import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import TodaySwipe from "@/components/TodaySwipe";
import AppGate from "@/components/AppGate";

export default async function TodayPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSession();
  if (!session || session.slug !== slug) redirect(`/${slug}`);
  if (session.role !== "owner") redirect(`/${slug}/app`);

  return (
    <AppGate slug={slug}>
      <TodaySwipe slug={slug} />
    </AppGate>
  );
}
