// Helper to toggle global banner-active state and inject a fallback style
const STYLE_ID = 'hint-banner-active-style';

export function setBannerActive(on: boolean) {
  try {
    if (on) {
      document.body.classList.add('hint-banner-active');
      if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.innerHTML = `body.hint-banner-active .hint-request-bar-right-request-button { background-color: #d1d5db !important; color: #6b7280 !important; cursor: default !important; opacity: 0.9; }`;
        document.head.appendChild(style);
      }
    } else {
      document.body.classList.remove('hint-banner-active');
      const s = document.getElementById(STYLE_ID);
      if (s && s.parentElement) s.parentElement.removeChild(s);
    }
  } catch {}
}

export default setBannerActive;
