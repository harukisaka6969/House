import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return {
    manifest: `/${slug}/manifest.webmanifest`,
  };
}

export default function SlugLayout({ children }: { children: React.ReactNode }) {
  return children;
}
