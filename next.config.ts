import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // argon2 (PINハッシュ) はネイティブバイナリを含むため、Next.jsのバンドラーに
  // 巻き込ませず外部モジュールとしてそのまま require させる必要がある。
  // これが無いとVercel等のサーバーレス環境でモジュール解決に失敗し、
  // pinAuth.ts を経由するあらゆるルートが500になる。
  serverExternalPackages: ["argon2"],
};

export default nextConfig;
