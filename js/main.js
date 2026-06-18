/**
 * main.js — utilities condivise tra tutte le pagine
 */

/* ── Hamburger menu ─────────────────────────────────────────── */
(function initBurger() {
  const burger = document.getElementById('navbar-burger');
  const menu   = document.getElementById('navbar-menu');
  if (!burger || !menu) return;

  burger.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open);
  });

  // Chiudi cliccando fuori
  document.addEventListener('click', e => {
    if (!burger.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('is-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    }
  });
})();

/* ── Navigazione attiva ─────────────────────────────────────── */
(function markActiveNav() {
  const links = document.querySelectorAll('.navbar__nav a');
  const path  = location.pathname.split('/').pop() || 'index.html';
  links.forEach(a => {
    const href = a.getAttribute('href').split('/').pop();
    if (href === path) a.classList.add('active');
    // Segna flag audio quando si clicca "Candidati"
    if (href === 'candidatura.html') {
      a.addEventListener('click', () => {
        sessionStorage.setItem('semmen_audio_autoplay', '1');
      });
    }
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

  <!-- Stella centrale -->
  <image href="img/star.png" x="37" y="37" width="126" height="126"/>
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
