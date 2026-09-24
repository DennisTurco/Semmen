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
    <textPath href="#outerRing" startOffset="3%">· LA SETTA DEL SEMMEN · EST. MMXXV ·</textPath>
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

/* ── Stato automatico eventi ────────────────────────────────── */
// "Imminente" entro 7 giorni dalla data, "Passato" se già trascorsa,
// altrimenti "In programma". Usata da eventi.js e pannello.js così lo
// stato non richiede mai un aggiornamento manuale.
const SOGLIA_IMMINENTE_GIORNI = 7;

function calcolaStatoEvento(dataStr) {
  if (!dataStr) return 'In programma';
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const data = new Date(dataStr);
  if (isNaN(data)) return 'In programma';
  data.setHours(0, 0, 0, 0);

  const diffGiorni = Math.round((data - oggi) / 86400000);
  if (diffGiorni < 0) return 'Passato';
  if (diffGiorni <= SOGLIA_IMMINENTE_GIORNI) return 'Imminente';
  return 'In programma';
}

/* ── Animazioni on-scroll ───────────────────────────────────────
   Diverse pagine (eventi.js, discepoli.html, attivita.js…) iniettano
   card con [data-reveal] DOPO il caricamento di main.js (es. dopo una
   fetch a Supabase), quindi non basta osservare gli elementi presenti
   al momento del load: un MutationObserver aggancia anche quelli
   aggiunti dinamicamente in seguito. */
(function initScrollReveal() {
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll('[data-reveal]').forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        observer.unobserve(e.target);
      }
    }),
    { threshold: 0.1 }
  );

  function observeAll(root) {
    root.querySelectorAll('[data-reveal]').forEach(el => observer.observe(el));
  }

  observeAll(document);

  new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      if (node.matches && node.matches('[data-reveal]')) observer.observe(node);
      if (node.querySelectorAll) observeAll(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });
})();

/* ── Atmosfera: barra di lettura, navbar allo scroll, torcia, card ── */
(function initAtmosphere() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer  = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const progress = document.createElement('div');
  progress.className = 'scroll-progress';
  document.body.appendChild(progress);

  const navbar = document.querySelector('.navbar');
  let scrollTicking = false;

  function onScroll() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? window.scrollY / max : 0})`;
    if (navbar) navbar.classList.toggle('is-scrolled', window.scrollY > 12);
    scrollTicking = false;
  }

  window.addEventListener('scroll', () => {
    if (!scrollTicking) { scrollTicking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  if (!finePointer || reduceMotion) return;

  const torch = document.createElement('div');
  torch.className = 'torch';
  document.body.appendChild(torch);

  let px = 0, py = 0, tx = 0, ty = 0, torchRunning = false;

  function moveTorch() {
    tx += (px - tx) * 0.15;
    ty += (py - ty) * 0.15;
    torch.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
    if (Math.abs(px - tx) > 0.5 || Math.abs(py - ty) > 0.5) requestAnimationFrame(moveTorch);
    else torchRunning = false;
  }

  document.addEventListener('pointermove', e => {
    px = e.clientX;
    py = e.clientY;
    torch.classList.add('is-on');
    if (!torchRunning) { torchRunning = true; requestAnimationFrame(moveTorch); }

    const card = e.target.closest && e.target.closest('.feature-card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty('--mx', `${x * 100}%`);
    card.style.setProperty('--my', `${y * 100}%`);
    card.style.transform =
      `perspective(900px) rotateX(${(0.5 - y) * 6}deg) rotateY(${(x - 0.5) * 8}deg) translateY(-4px)`;
  }, { passive: true });

  document.addEventListener('pointerout', e => {
    const card = e.target.closest && e.target.closest('.feature-card');
    if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
  });

  document.documentElement.addEventListener('pointerleave', () => torch.classList.remove('is-on'));
})();
