"use client";

import { SectionHead } from "../common";
import DigestBanner from "../DigestBanner";

/** 全体のダッシュボード。前日のまとめ・週間ダイジェストはここにのみ表示する。 */
export default function Home() {
  return (
    <section className="mf-section">
      <SectionHead no="19" title="ホーム" sub="前日のまとめと週間ダイジェストをここで見られます。" />
      <DigestBanner />
    </section>
  );
}
