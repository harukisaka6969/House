import { notFound } from "next/navigation";
import { getProfileBySlug } from "@/lib/pinAuth";
import LockScreen from "@/components/LockScreen";

export default async function SlugLockPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  return <LockScreen slug={profile.slug} name={profile.name} authMethod={profile.auth_method} />;
}
