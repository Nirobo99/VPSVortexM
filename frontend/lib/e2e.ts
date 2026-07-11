const E2E_ALGO = { name: "ECDH", namedCurve: "P-256" } as const;
const AES_ALGO = { name: "AES-GCM", length: 256 } as const;

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(E2E_ALGO, true, ["deriveKey"]);
}

export async function exportPublicKeyB64(publicKey: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", publicKey);
  return bufToB64(raw);
}

export async function importPublicKeyB64(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", b64ToBuf(b64), E2E_ALGO, true, []);
}

export async function deriveAesKey(privateKey: CryptoKey, publicKey: CryptoKey): Promise<CryptoKey> {
  const shared = await crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    AES_ALGO,
    false,
    ["encrypt", "decrypt"]
  );
  return shared;
}

export async function encryptMessage(aesKey: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return bufToB64(combined.buffer);
}

export async function decryptMessage(aesKey: CryptoKey, payload: string): Promise<string> {
  const data = new Uint8Array(b64ToBuf(payload));
  const iv = data.slice(0, 12);
  const cipher = data.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, cipher);
  return new TextDecoder().decode(plain);
}

const storageKey = (dialogId: string) => `e2e_priv_${dialogId}`;

export async function getOrCreateDialogKeys(dialogId: string): Promise<CryptoKeyPair> {
  const privStored = sessionStorage.getItem(storageKey(dialogId));
  const pubStored = sessionStorage.getItem(`${storageKey(dialogId)}_pub`);
  if (privStored && pubStored) {
    const privateKey = await crypto.subtle.importKey("jwk", JSON.parse(privStored), E2E_ALGO, true, ["deriveKey"]);
    const publicKey = await importPublicKeyB64(pubStored);
    return { privateKey, publicKey };
  }
  const pair = await generateKeyPair();
  const privJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pubB64 = await exportPublicKeyB64(pair.publicKey);
  sessionStorage.setItem(storageKey(dialogId), JSON.stringify(privJwk));
  sessionStorage.setItem(`${storageKey(dialogId)}_pub`, pubB64);
  return pair;
}

export async function getSharedAesKey(
  dialogId: string,
  otherPublicKeyB64: string
): Promise<CryptoKey> {
  const { privateKey } = await getOrCreateDialogKeys(dialogId);
  const otherPub = await importPublicKeyB64(otherPublicKeyB64);
  return deriveAesKey(privateKey, otherPub);
}
