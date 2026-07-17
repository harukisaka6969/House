import { WebAuthnError, type WebAuthnErrorCode } from "@simplewebauthn/browser";

const MESSAGES: Record<WebAuthnErrorCode, string> = {
  ERROR_CEREMONY_ABORTED: "操作がキャンセルされました。もう一度お試しください。",
  ERROR_INVALID_DOMAIN: "このサイトのドメイン設定に問題があり登録できません（サーバー設定の問題です。開発者に連絡してください）。",
  ERROR_INVALID_RP_ID: "このサイトのRP ID設定に問題があり登録できません（サーバー設定の問題です。開発者に連絡してください）。",
  ERROR_INVALID_USER_ID_LENGTH: "内部エラーが発生しました（開発者に連絡してください）。",
  ERROR_MALFORMED_PUBKEYCREDPARAMS: "内部エラーが発生しました（開発者に連絡してください）。",
  ERROR_AUTHENTICATOR_GENERAL_ERROR: "認証器でエラーが発生しました。Face ID / Touch IDが端末で有効になっているか確認してください。",
  ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT: "このデバイスはパスキーの保存に対応していません。",
  ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT: "このデバイスはFace ID / Touch IDでの本人確認に対応していません。",
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: "このデバイスはすでに登録されています。",
  ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG: "このデバイスに対応した暗号方式がありません。",
  ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE: "本人確認に失敗しました。",
  ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY: "登録処理でエラーが発生しました。",
};

/** startRegistration/startAuthenticationが投げるエラーを、可能な限り具体的な日本語メッセージに変換する。 */
export function describeWebAuthnError(e: unknown): string {
  if (e instanceof WebAuthnError) {
    const base = MESSAGES[e.code] ?? e.message;
    return `${base}（${e.code}）`;
  }
  if (e instanceof Error) {
    if (e.name === "NotAllowedError") return "Face ID / Touch IDでの確認がタイムアウトしたか、キャンセルされました。もう一度お試しください。";
    if (e.name === "SecurityError") return "セキュリティエラーです。サイトのドメイン設定を確認してください（開発者に連絡してください）。";
    return `${e.message}（${e.name}）`;
  }
  return "不明なエラーが発生しました。";
}
