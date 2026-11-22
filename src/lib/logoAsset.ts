const LOGO_URL = '/assets/aistudio/g_ncel_TINIATECH__S_ML__817f9f87.png';

let cachedLogoDataUrlPromise: Promise<string | null> | null = null;

export function getTiniatechLogoDataUrl(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve(null);
  }
  if (!cachedLogoDataUrlPromise) {
    cachedLogoDataUrlPromise = fetch(LOGO_URL)
      .then((res) => {
        if (!res.ok) return null;
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            if (!blob) {
              resolve(null);
              return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(typeof reader.result === 'string' ? reader.result : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          })
      )
      .catch(() => null);
  }
  return cachedLogoDataUrlPromise;
}
