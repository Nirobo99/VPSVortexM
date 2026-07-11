declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, options: { action: string }) => Promise<string>;
    };
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

export async function getCaptchaToken(action: string): Promise<string | null> {
  if (!SITE_KEY || typeof window === "undefined" || !window.grecaptcha) {
    return null;
  }

  return new Promise((resolve, reject) => {
    window.grecaptcha?.ready(() => {
      window.grecaptcha
        ?.execute(SITE_KEY, { action })
        .then(resolve)
        .catch(reject);
    });
  });
}

export function hasCaptchaEnabled(): boolean {
  return Boolean(SITE_KEY);
}
