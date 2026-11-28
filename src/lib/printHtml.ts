export function escapeHtml(val: string | number | null | undefined): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function printHtmlDocument(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.addEventListener('afterprint', cleanup);
    win.focus();
    win.print();
    window.setTimeout(cleanup, 60000);
  };

  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}
