import "server-only";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL, isoUint8Array } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON, AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/server";
import { db } from "./db";
import { setChallengeCookie, consumeChallengeCookie } from "./session";
import type { ProfileRow } from "./pinAuth";

function rpConfig() {
  const rpID = process.env.WEBAUTHN_RP_ID;
  const origin = process.env.WEBAUTHN_ORIGIN;
  if (!rpID || !origin) throw new Error("WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN is not configured");
  return { rpID, origin, rpName: "坂家 家計フローダッシュボード" };
}

interface CredentialRow {
  id: string;
  profile_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_name: string;
  transports: string[];
}

async function getCredentialsForProfile(profileId: string): Promise<CredentialRow[]> {
  const { data, error } = await db().from("webauthn_credentials").select("*").eq("profile_id", profileId);
  if (error) throw error;
  return (data ?? []) as CredentialRow[];
}

export async function buildRegistrationOptions(profile: ProfileRow) {
  const { rpID, rpName } = rpConfig();
  const existing = await getCredentialsForProfile(profile.id);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: profile.slug,
    userDisplayName: profile.name,
    userID: isoUint8Array.fromUTF8String(profile.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
  });
  await setChallengeCookie({ challenge: options.challenge, profile_id: profile.id, purpose: "register" });
  return options;
}

export async function verifyRegistration(
  profileId: string,
  response: RegistrationResponseJSON,
  deviceName: string
): Promise<{ verified: boolean }> {
  const challengeData = await consumeChallengeCookie();
  if (!challengeData || challengeData.purpose !== "register" || challengeData.profile_id !== profileId) {
    return { verified: false };
  }
  const { rpID, origin } = rpConfig();

  let result: VerifiedRegistrationResponse;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch {
    return { verified: false };
  }
  if (!result.verified || !result.registrationInfo) return { verified: false };

  const { credential } = result.registrationInfo;
  const { error } = await db().from("webauthn_credentials").insert({
    profile_id: profileId,
    credential_id: credential.id,
    public_key: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    device_name: deviceName || "このデバイス",
    transports: credential.transports ?? [],
  });
  if (error) throw error;
  return { verified: true };
}

export async function buildAuthenticationOptions(profile: ProfileRow) {
  const { rpID } = rpConfig();
  const existing = await getCredentialsForProfile(profile.id);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: existing.map((c) => ({
      id: c.credential_id,
      transports: c.transports as AuthenticatorTransportFuture[],
    })),
  });
  await setChallengeCookie({ challenge: options.challenge, profile_id: profile.id, purpose: "login" });
  return options;
}

export async function verifyAuthentication(
  response: AuthenticationResponseJSON
): Promise<{ verified: boolean; profileId?: string }> {
  const challengeData = await consumeChallengeCookie();
  if (!challengeData || challengeData.purpose !== "login") return { verified: false };

  const { data: credRow, error: credErr } = await db()
    .from("webauthn_credentials")
    .select("*")
    .eq("credential_id", response.id)
    .eq("profile_id", challengeData.profile_id)
    .maybeSingle();
  if (credErr) throw credErr;
  if (!credRow) return { verified: false };

  const { rpID, origin } = rpConfig();
  let result: VerifiedAuthenticationResponse;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credRow.credential_id,
        publicKey: isoBase64URL.toBuffer(credRow.public_key),
        counter: credRow.counter,
        transports: credRow.transports as AuthenticatorTransportFuture[],
      },
    });
  } catch {
    return { verified: false };
  }
  if (!result.verified) return { verified: false };

  await db()
    .from("webauthn_credentials")
    .update({ counter: result.authenticationInfo.newCounter })
    .eq("id", credRow.id);

  return { verified: true, profileId: challengeData.profile_id };
}

export async function deleteCredential(profileId: string, credentialRowId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("webauthn_credentials")
    .delete()
    .eq("id", credentialRowId)
    .eq("profile_id", profileId)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
