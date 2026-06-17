/**
 * main.js — utilities condivise tra tutte le pagine
 */

/* ── Navigazione attiva ─────────────────────────────────────── */
(function markActiveNav() {
  const links = document.querySelectorAll('.navbar__nav a');
  const path  = location.pathname.split('/').pop() || 'index.html';
  links.forEach(a => {
    const href = a.getAttribute('href').split('/').pop();
    if (href === path) a.classList.add('active');
  });
})();

/* ── Inline SVG del sigillo ─────────────────────────────────── */
const SEAL_SVG = `<svg class="seal" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Sigillo del Semmen">
  <defs>
    <path id="outerRing" d="M100,100 m-82,0 a82,82 0 1,1 164,0 a82,82 0 1,1 -164,0"/>
    <path id="innerRing" d="M100,100 m-66,0 a66,66 0 1,1 132,0 a66,66 0 1,1 -132,0"/>
  </defs>

  <!-- Cerchi decorativi -->
  <circle cx="100" cy="100" r="95" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  <circle cx="100" cy="100" r="88" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.3"/>
  <circle cx="100" cy="100" r="70" fill="none" stroke="currentColor" stroke-width="1" opacity="0.4"/>
  <circle cx="100" cy="100" r="63" fill="none" stroke="currentColor" stroke-width="0.5" opacity="0.2"/>

  <!-- Puntini decorativi sul cerchio esterno -->
  <g opacity="0.4">
    ${Array.from({length: 24}, (_, i) => {
      const angle = (i * 15) * Math.PI / 180;
      const x = 100 + 91.5 * Math.cos(angle);
      const y = 100 + 91.5 * Math.sin(angle);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${i % 3 === 0 ? 1.8 : 1}" fill="currentColor"/>`;
    }).join('')}
  </g>

  <!-- Testo circolare -->
  <text font-family="'IM Fell English', Georgia, serif" font-size="9.5" fill="currentColor" letter-spacing="3.2" opacity="0.8">
    <textPath href="#outerRing" startOffset="3%">· LA SETTA DEL SEMMEN · EST. MMXXIV ·</textPath>
  </text>

  <!-- Lettera centrale -->
  <text x="100" y="118" font-family="'IM Fell English', Georgia, serif" font-size="72"
        fill="currentColor" text-anchor="middle" opacity="0.95">S</text>

  <!-- Linee decorative laterali -->
  <line x1="30" y1="100" x2="52" y2="100" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>
  <line x1="148" y1="100" x2="170" y2="100" stroke="currentColor" stroke-width="0.8" opacity="0.5"/>
  <circle cx="30" cy="100" r="2" fill="currentColor" opacity="0.4"/>
  <circle cx="170" cy="100" r="2" fill="currentColor" opacity="0.4"/>
</svg>`;

/* Inietta il sigillo in tutti gli elementi .seal-container */
document.querySelectorAll('.seal-container').forEach(el => {
  el.innerHTML = SEAL_SVG;
  const svg = el.querySelector('svg');
  if (svg) svg.style.color = 'var(--gold)';
});

/* ── Animazioni on-scroll ───────────────────────────────────── */
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        observer.unobserve(e.target);
      }
    }),
    { threshold: 0.1 }
  );
  document.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
}
