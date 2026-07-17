import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

/**
 * PINハッシュ用のscrypt実装。Node組み込みのcrypto以外に一切依存しない
 * （argon2はネイティブバイナリを含み、Vercelのサーバーレス環境でNode.jsの
 * バージョンやビルドキャッシュの組み合わせ次第でABI不一致により全ルートが
 * 500になる — これを構造的に排除するための選択）。
 */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(pin, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPin(hash: string, pin: string): Promise<boolean> {
  const parts = hash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const derived = await scrypt(pin, salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
