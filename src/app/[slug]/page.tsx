import { notFound } from "next/navigation";
import { getProfileBySlug } from "@/lib/pinAuth";
import LockScreen from "@/components/LockScreen";
import AutoLogin from "@/components/AutoLogin";

// ハルキ・アリサ（role=owner）はPIN入力なしで今日の支出スワイプ画面へ直行する。
// 家族用・kiosk用アカウントは今まで通りPINロック画面（セッションCookieが有効かに関わらず常に表示、
// 「このブラウザ/プロセスで既にPINを通したか」はLockScreen側でsessionStorageを見て判断する）。
export default async function SlugLockPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();

  if (profile.role === "owner") {
    return <AutoLogin slug={profile.slug} />;
  }

  return <LockScreen slug={profile.slug} name={profile.name} />;
}
