import { notFound } from "next/navigation";
import { getProfileBySlug } from "@/lib/pinAuth";
import LockScreen from "@/components/LockScreen";

// セッションCookieが有効かどうかに関わらず常にロック画面を表示する。
// 「このブラウザ/プロセスで既にPINを通したか」はLockScreen側でsessionStorageを見て判断し、
// 通していれば自動で/appへ進む（バックグラウンド→復帰の往復ではPINを聞かない）。
export default async function SlugLockPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  return <LockScreen slug={profile.slug} name={profile.name} />;
}
