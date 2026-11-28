const LOGO_URL = `${import.meta.env.BASE_URL}assets/aistudio/g_ncel_TINIATECH__S_ML__817f9f87.png`;

let cachedLogoDataUrlPromise: Promise<string | null> | null = null;

export function getTiniatechLogoDataUrl(): Promise<string | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve(null);
  }
  if (!cachedLogoDataUrlPromise) {
    cachedLogoDataUrlPromise = fetch(LOGO_URL)
      .then((res) => {
        const contentType = res.headers.get('content-type') || '';
        if (!res.ok || !contentType.toLowerCase().startsWith('image/')) {
          return null;
        }
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
              const resStr = typeof reader.result === 'string' ? reader.result : null;
              resolve(resStr && resStr.startsWith('data:image/') ? resStr : null);
            };
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          })
      )
      .catch(() => null);
  }
  return cachedLogoDataUrlPromise;
}
