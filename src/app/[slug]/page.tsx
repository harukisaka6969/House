import { notFound, redirect } from "next/navigation";
import { getProfileBySlug } from "@/lib/pinAuth";
import { getSession } from "@/lib/session";
import LockScreen from "@/components/LockScreen";

export default async function SlugLockPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  const session = await getSession();
  if (session && session.slug === slug) {
    redirect(`/${slug}/app`);
  }

  return <LockScreen slug={profile.slug} name={profile.name} />;
}
