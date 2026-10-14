// GitHub Pages hosts the interface; Cloudflare handles authenticated requests.
window.MANKHUL_API_BASE = location.hostname === 'munkhuliq.github.io'
  ? 'https://mankhul-shortages.munkhul-iq.workers.dev'
  : '';
