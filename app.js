(() => {
  const state = {
    slides: [],
    activeIndex: 0,
    io: null,
    wheelLock: false,
    textScaleMin: 0.85,
    textScaleMax: 1.08
  };

  const qs = (sel, el=document) => el.querySelector(sel);
  const qsa = (sel, el=document) => Array.from(el.querySelectorAll(sel));
  const el = (tag, cls, attrs={}) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    for (const k in attrs) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    return e;
  };

  async function loadContent() {
    const res = await fetch('./content.json?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to load content.json');
    return res.json();
  }

  function setTopOffset() {
    const top = qs('#topbar');
    const h = top ? top.getBoundingClientRect().height : 0;
    document.documentElement.style.setProperty('--topOffset', `${Math.round(h)}px`);
  }

  function applyCompactMode() {
    const compact = window.innerHeight < 740;
    document.body.classList.toggle('compact', compact);
  }

  function buildSlides(data) {
    const slidesWrap = qs('#slides');
    if (!slidesWrap) return;
    slidesWrap.innerHTML = '';

    // Brand title
    const brandTitle = qs('#brandTitle');
    if (brandTitle) brandTitle.textContent = data?.meta?.title || 'Deck';

    state.slides = data.slides || [];

    state.slides.forEach((s, idx) => {
      const slide = el('section', `slide ${s.type || 'content'}`);
      slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'slide');
      slide.setAttribute('aria-label', (s.headline || `Slide ${idx+1}`));
      slide.dataset.index = String(idx);

      const card = el('div', 'card');
      const inner = el('div', 's-inner');

      // Header
      const header = el('header', 'header');
      if (s.headline) {
        const h = el('h1', 'title' + ((s.type === 'title' || s.type === 'section') ? ' grad' : ''), { text: s.headline });
        h.setAttribute('data-animate', ''); h.classList.add('d0');
        header.appendChild(h);
      }
      if (s.subheadline) {
        const sub = el('p', 'subtitle', { text: s.subheadline });
        sub.setAttribute('data-animate', ''); sub.classList.add('d1');
        header.appendChild(sub);
      }

      // Content area
      const content = el('div', 'contentBlock');

      if (s.type === 'title') {
        // Minimal, centered
      } else if (s.type === 'section') {
        // Section divider: nothing else
      } else if (s.type === 'closing') {
        // Optional bullets in closing
        if (Array.isArray(s.bullets) && s.bullets.length) {
          const ul = buildBullets(s.bullets);
          content.appendChild(ul);
        }
      } else if (s.type === 'beforeAfter') {
        // Optional type not used in this deck but supported
        const grid = el('div', 'grid cols-2');
        const left = el('div', 'col'); const right = el('div', 'col');
        left.setAttribute('data-animate', ''); left.classList.add('d2');
        right.setAttribute('data-animate', ''); right.classList.add('d3');
        if (s.left?.title) left.appendChild(el('h3', 'colTitle', { text: s.left.title }));
        if (Array.isArray(s.left?.bullets)) left.appendChild(buildBullets(s.left.bullets, true));
        if (s.right?.title) right.appendChild(el('h3', 'colTitle', { text: s.right.title }));
        if (Array.isArray(s.right?.bullets)) right.appendChild(buildBullets(s.right.bullets, true));
        grid.append(left, right); content.appendChild(grid);
      } else {
        // Generic content
        if (s.left || s.right) {
          const grid = el('div', 'grid cols-2');
          const left = el('div', 'col'); const right = el('div', 'col');
          left.setAttribute('data-animate', ''); left.classList.add('d2');
          right.setAttribute('data-animate', ''); right.classList.add('d3');
          if (s.left?.title) left.appendChild(el('h3', 'colTitle', { text: s.left.title }));
          if (Array.isArray(s.left?.bullets)) left.appendChild(buildBullets(s.left.bullets, true));
          if (s.right?.title) right.appendChild(el('h3', 'colTitle', { text: s.right.title }));
          if (Array.isArray(s.right?.bullets)) right.appendChild(buildBullets(s.right.bullets, true));
          content.appendChild(grid);
        } else {
          // One-column bullets + optional decorative panel for widescreen balance
          if (Array.isArray(s.bullets) && s.bullets.length) {
            const grid = el('div', 'grid');
            grid.classList.add('cols-2', 'has-accent');
            const mainCol = el('div', 'col');
            mainCol.setAttribute('data-animate', ''); mainCol.classList.add('d2');
            mainCol.appendChild(buildBullets(s.bullets));
            const accent = el('div', 'accentPanel'); accent.setAttribute('aria-hidden', 'true');
            grid.append(mainCol, accent);
            content.appendChild(grid);
          }
        }
      }

      inner.append(header, content);
      card.appendChild(inner);
      slide.appendChild(card);
      slidesWrap.appendChild(slide);
    });
  }

  function buildBullets(items, noGradFirst=false) {
    const ul = el('ul', 'bullets');
    items.slice(0, 6).forEach((t, i) => {
      const li = el('li');
      li.setAttribute('data-animate', '');
      li.classList.add(`d${Math.min(2+i,6)}`);
      const span = el('span', '');
      span.textContent = t;
      if (!noGradFirst && i === 0) span.classList.add('key', 'grad');
      li.appendChild(span);
      ul.appendChild(li);
    });
    return ul;
  }

  function setupObserver() {
    const slides = qsa('.slide');
    if (state.io) state.io.disconnect();
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio);
      if (!visible.length) return;
      const el = visible[0].target;
      const idx = Number(el.dataset.index || 0);
      setActiveSlide(idx);
    }, { root: qs('#deck'), threshold: [0.4, 0.6, 0.75] });
    slides.forEach(s => io.observe(s));
    state.io = io;
  }

  function setActiveSlide(index) {
    const slides = qsa('.slide');
    index = Math.max(0, Math.min(slides.length - 1, index));
    if (state.activeIndex === index) {
      updateProgress();
      return;
    }
    state.activeIndex = index;
    slides.forEach((s, i) => s.classList.toggle('is-active', i === index));
    updateProgress();
    fitTypographyFor(index);
  }

  function goTo(index, smooth=true) {
    const deck = qs('#deck');
    const slide = qs(`.slide[data-index="${index}"]`);
    if (!deck || !slide) return;
    const topOffset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topOffset')) || 0;
    const y = slide.offsetTop - topOffset;
    deck.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
  }

  function next() { if (state.activeIndex < state.slides.length - 1) goTo(state.activeIndex + 1); }
  function prev() { if (state.activeIndex > 0) goTo(state.activeIndex - 1); }

  function setupKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && (e.target.tagName || '')).toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.isComposing) return;
      if (e.code === 'Space') { e.preventDefault(); e.shiftKey ? prev() : next(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
    });
  }

  function canScrollWithin(target, deltaY) {
    let el = target instanceof Element ? target : null;
    while (el && el !== document.body) {
      const style = getComputedStyle(el);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        if (deltaY > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true; // can scroll down
        if (deltaY < 0 && el.scrollTop > 0) return true; // can scroll up
      }
      el = el.parentElement;
    }
    return false;
  }

  function setupWheel() {
    const deck = qs('#deck');
    if (!deck) return;
    deck.addEventListener('wheel', (e) => {
      if (state.wheelLock) return;
      if (canScrollWithin(e.target, e.deltaY)) return; // allow inner scroll first
      e.preventDefault();
      state.wheelLock = true;
      if (e.deltaY > 0) next(); else prev();
      setTimeout(() => state.wheelLock = false, 500);
    }, { passive: false });
  }

  function buildDots() {
    const nav = qs('#sideDots');
    if (!nav) return;
    nav.innerHTML = '';
    const total = state.slides.length;
    state.slides.forEach((s, i) => {
      const btn = el('button', 'dotBtn', { 'type': 'button' });
      const inner = el('span', 'dotInner', { 'aria-hidden': 'true' });
      btn.appendChild(inner);
      btn.setAttribute('aria-label', `Slide ${i+1} of ${total}${s.headline ? ': ' + s.headline : ''}`);
      btn.addEventListener('click', () => goTo(i));
      nav.appendChild(btn);
    });
    updateProgress();
  }

  function updateProgress() {
    const total = state.slides.length;
    const idx = state.activeIndex;
    const pct = total > 1 ? (idx / (total - 1)) * 100 : 0;
    const bar = qs('#topProgressBar');
    if (bar) bar.style.width = pct + '%';
    const dots = qsa('#sideDots button');
    dots.forEach((d, i) => d.setAttribute('aria-current', i === idx ? 'true' : 'false'));
  }

  function fitTypographyAll() { qsa('.slide').forEach((_, i) => fitTypographyFor(i)); }

  function fitTypographyFor(index) {
    const slide = qs(`.slide[data-index="${index}"]`);
    if (!slide) return;
    const inner = qs('.s-inner', slide) || slide;
    const getScale = () => parseFloat(getComputedStyle(slide).getPropertyValue('--textScale')) || 1;
    let scale = getScale();
    const max = state.textScaleMax;
    const min = state.textScaleMin;

    // First, reset to 1 to measure natural content
    slide.style.setProperty('--textScale', '1');
    scale = 1;

    const fits = () => inner.scrollHeight <= inner.clientHeight;

    // Decrease until fits
    if (!fits()) {
      while (!fits() && scale > min) {
        scale = Math.max(min, +(scale - 0.02).toFixed(2));
        slide.style.setProperty('--textScale', String(scale));
      }
    } else {
      // Gently grow if there's ample space
      while (fits() && scale < max) {
        const prev = scale;
        scale = Math.min(max, +(scale + 0.02).toFixed(2));
        slide.style.setProperty('--textScale', String(scale));
        if (!fits()) { // revert if overflow
          slide.style.setProperty('--textScale', String(prev));
          break;
        }
      }
    }
  }

  function setupNavButtons() {
    const prevBtn = qs('#prevBtn');
    const nextBtn = qs('#nextBtn');
    if (prevBtn) prevBtn.addEventListener('click', prev);
    if (nextBtn) nextBtn.addEventListener('click', next);
  }

  async function setupPdfExport() {
    const btn = qs('#exportPdfBtn');
    if (!btn) return;

    const ensureLib = (src) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });

    btn.addEventListener('click', async () => {
      try {
        btn.disabled = true; const old = btn.textContent; btn.textContent = 'Exporting…';
        document.body.classList.add('exportingPdf');

        // Load libs on demand
        if (!window.html2canvas) await ensureLib('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        if (!(window.jspdf && window.jspdf.jsPDF)) await ensureLib('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1920, 1080] });
        const scale = Math.max(2, window.devicePixelRatio || 1);

        const stage = qs('#pdfStage');
        if (!stage) throw new Error('PDF stage missing');

        const bgLayers = qsa('.bgLayer');

        for (let i = 0; i < state.slides.length; i++) {
          // Prepare stage per slide
          stage.innerHTML = '';
          // Clone background layers into stage
          bgLayers.forEach(b => stage.appendChild(b.cloneNode(true)));

          // Clone slide
          const srcSlide = qs(`.slide[data-index="${i}"]`);
          const clone = srcSlide.cloneNode(true);
          clone.classList.add('is-active');
          stage.appendChild(clone);

          // Ensure full visibility in export
          clone.querySelectorAll('[data-animate]').forEach(n => n.removeAttribute('data-animate'));

          const canvas = await window.html2canvas(stage, {
            backgroundColor: '#050611',
            scale,
            width: 1920,
            height: 1080,
            windowWidth: 1920,
            windowHeight: 1080,
            useCORS: true
          });
          const img = canvas.toDataURL('image/png');
          if (i > 0) doc.addPage([1920,1080], 'landscape');
          doc.addImage(img, 'PNG', 0, 0, 1920, 1080);
        }

        doc.save('FlowPitch.pdf');
      } catch (err) {
        console.error(err);
        alert('PDF export failed. Please allow cdnjs.cloudflare.com or self-host the libraries.');
      } finally {
        document.body.classList.remove('exportingPdf');
        btn.disabled = false; btn.textContent = 'Export PDF';
      }
    });
  }

  function init() {
    setTopOffset();
    applyCompactMode();
    window.addEventListener('resize', () => { setTopOffset(); applyCompactMode(); fitTypographyAll(); });

    loadContent().then(data => {
      buildSlides(data);
      setupObserver();
      setupKeys();
      setupWheel();
      setupNavButtons();
      buildDots();
      // Mark first active
      const first = qs('.slide[data-index="0"]'); if (first) first.classList.add('is-active');
      fitTypographyAll();
      setupPdfExport();
    }).catch(err => {
      console.error('Error:', err);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
