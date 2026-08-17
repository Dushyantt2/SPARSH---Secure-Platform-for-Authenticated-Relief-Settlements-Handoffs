import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../landing.css';

// ============================================================
// SPARSH — landing page ported verbatim from landing_page.zip
// (index.html + style.css + script.js). Styles are scoped under
// .sparsh-landing so they never leak into the app dashboards.
// ============================================================

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const page = root;

    // ---- NAVBAR SCROLL ----
    const navbar = root.querySelector<HTMLElement>('#navbar');
    const onScrollNav = () => navbar?.classList.toggle('scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScrollNav, { passive: true });

    // ---- HAMBURGER MENU ----
    const hamburger = root.querySelector<HTMLElement>('#hamburger');
    const navLinks = root.querySelector<HTMLElement>('#nav-links');
    const onHamburger = () => navLinks?.classList.toggle('open');
    hamburger?.addEventListener('click', onHamburger);

    // ---- INTERSECTION OBSERVER FOR FADE-IN ----
    const fadeObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    root.querySelectorAll('.fade-in').forEach((el) => fadeObserver.observe(el));

    // ---- STAT COUNTER ----
    const statObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        const target = parseFloat(el.dataset.target ?? '0');
        const suffix = el.dataset.suffix || '';
        const isDecimal = target % 1 !== 0;
        const duration = 2000;
        const start = performance.now();
        const animate = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 4);
          const current = eased * target;
          el.textContent = (isDecimal ? current.toFixed(1) : Math.floor(current)) + suffix;
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
        const bar = el.closest('.stat')?.querySelector<HTMLElement>('.stat__bar-fill');
        if (bar) bar.style.width = bar.style.getPropertyValue('--width');
        statObserver.unobserve(el);
      });
    }, { threshold: 0.5 });
    root.querySelectorAll('.stat__number').forEach((el) => statObserver.observe(el));

    // ---- STEPPER ANIMATION ----
    const stepper = root.querySelector<HTMLElement>('#stepper');
    let stepTimer: ReturnType<typeof setInterval> | undefined;
    if (stepper) {
      const steps = stepper.querySelectorAll('.stepper__step');
      const fill = root.querySelector<HTMLElement>('#stepper-fill');
      let current = 0;
      const activateStep = (index: number) => {
        steps.forEach((s, i) => s.classList.toggle('active', i <= index));
        if (fill) fill.style.width = `${(index / (steps.length - 1)) * 100}%`;
      };
      activateStep(0);
      stepTimer = setInterval(() => { current = (current + 1) % steps.length; activateStep(current); }, 2500);
      steps.forEach((step, i) => step.addEventListener('click', () => { current = i; activateStep(i); }));
    }

    // ---- NAVBAR ACTIVE LINK ON SCROLL ----
    const sections = root.querySelectorAll('section[id]');
    const navLinksAll = root.querySelectorAll('.navbar__link:not(.navbar__link--outline):not(.navbar__link--filled)');
    const onScrollSpy = () => {
      let current = '';
      sections.forEach((section) => {
        const sectionTop = (section as HTMLElement).offsetTop - 120;
        if (window.scrollY >= sectionTop) current = section.getAttribute('id') ?? '';
      });
      navLinksAll.forEach((link) => {
        link.classList.remove('navbar__link--active');
        if (link.getAttribute('href') === `#${current}`) link.classList.add('navbar__link--active');
      });
    };
    window.addEventListener('scroll', onScrollSpy, { passive: true });

    // ============================================================
    // CANVAS PARTICLE SYSTEMS
    // ============================================================
    class ParticleSystem {
      private canvas: HTMLCanvasElement;
      private ctx: CanvasRenderingContext2D | null;
      private particles: any[] = [];
      private options: any;
      private raf = 0;

      constructor(canvasId: string, options: any = {}) {
        this.canvas = page.querySelector<HTMLCanvasElement>(`#${canvasId}`)!;
        this.ctx = null;
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.options = {
          count: options.count || 40,
          color: options.color || 'rgba(11, 61, 145, 0.12)',
          lineColor: options.lineColor || 'rgba(11, 61, 145, 0.04)',
          maxSize: options.maxSize || 3,
          speed: options.speed || 0.3,
          lineDistance: options.lineDistance || 120,
          drawLines: options.drawLines !== false,
          ...options,
        };
        this.resize();
        this.init();
        this.animate();
        window.addEventListener('resize', this.resize);
      }

      resize = () => {
        if (!this.canvas) return;
        const rect = this.canvas.parentElement?.getBoundingClientRect();
        if (!rect) return;
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
      };

      init() {
        this.particles = [];
        for (let i = 0; i < this.options.count; i++) {
          this.particles.push({
            x: Math.random() * this.canvas.width,
            y: Math.random() * this.canvas.height,
            size: Math.random() * this.options.maxSize + 1,
            vx: (Math.random() - 0.5) * this.options.speed,
            vy: (Math.random() - 0.5) * this.options.speed,
            opacity: Math.random() * 0.5 + 0.3,
          });
        }
      }

      animate = () => {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > this.canvas.width) p.vx *= -1;
          if (p.y < 0 || p.y > this.canvas.height) p.vy *= -1;

          this.ctx!.beginPath();
          this.ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          this.ctx!.fillStyle = this.options.color;
          this.ctx!.globalAlpha = p.opacity;
          this.ctx!.fill();
          this.ctx!.globalAlpha = 1;
        });

        if (this.options.drawLines) {
          for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
              const dx = this.particles[i].x - this.particles[j].x;
              const dy = this.particles[i].y - this.particles[j].y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < this.options.lineDistance) {
                this.ctx.beginPath();
                this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                this.ctx.strokeStyle = this.options.lineColor;
                this.ctx.globalAlpha = 1 - dist / this.options.lineDistance;
                this.ctx.lineWidth = 0.5;
                this.ctx.stroke();
                this.ctx.globalAlpha = 1;
              }
            }
          }
        }

        this.raf = requestAnimationFrame(this.animate);
      };

      destroy() {
        cancelAnimationFrame(this.raf);
        window.removeEventListener('resize', this.resize);
      }
    }

    const systems: ParticleSystem[] = [];
    // Hero particles (bright on dark background)
    systems.push(new ParticleSystem('hero-canvas', {
      count: 60, color: 'rgba(255, 255, 255, 0.4)', lineColor: 'rgba(255, 255, 255, 0.08)',
      maxSize: 2.5, speed: 0.4, lineDistance: 150,
    }));
    // Quick Access particles (subtle blue dots)
    systems.push(new ParticleSystem('canvas-quick', {
      count: 35, color: 'rgba(59, 130, 246, 0.15)', lineColor: 'rgba(59, 130, 246, 0.04)',
      maxSize: 2, speed: 0.2, lineDistance: 100,
    }));
    // About particles (warm saffron dots)
    systems.push(new ParticleSystem('canvas-about', {
      count: 30, color: 'rgba(255, 153, 51, 0.12)', lineColor: 'rgba(255, 153, 51, 0.03)',
      maxSize: 2, speed: 0.15, lineDistance: 80,
    }));
    // Reliefs particles (blue dots)
    systems.push(new ParticleSystem('canvas-reliefs', {
      count: 30, color: 'rgba(11, 61, 145, 0.1)', lineColor: 'rgba(11, 61, 145, 0.03)',
      maxSize: 2, speed: 0.2, lineDistance: 90,
    }));
    // How It Works (pink/rose dots)
    systems.push(new ParticleSystem('canvas-how', {
      count: 25, color: 'rgba(236, 72, 153, 0.1)', lineColor: 'rgba(236, 72, 153, 0.03)',
      maxSize: 2, speed: 0.18, lineDistance: 100,
    }));
    // Trust & Legal (green dots)
    systems.push(new ParticleSystem('canvas-trust', {
      count: 30, color: 'rgba(16, 185, 129, 0.12)', lineColor: 'rgba(16, 185, 129, 0.04)',
      maxSize: 2, speed: 0.2, lineDistance: 90,
    }));
    // Support (purple dots)
    systems.push(new ParticleSystem('canvas-support', {
      count: 25, color: 'rgba(139, 92, 246, 0.12)', lineColor: 'rgba(139, 92, 246, 0.03)',
      maxSize: 2, speed: 0.15, lineDistance: 80,
    }));

    return () => {
      window.removeEventListener('scroll', onScrollNav);
      window.removeEventListener('scroll', onScrollSpy);
      hamburger?.removeEventListener('click', onHamburger);
      fadeObserver.disconnect();
      statObserver.disconnect();
      if (stepTimer) clearInterval(stepTimer);
      systems.forEach((s) => s.destroy());
    };
  }, []);

  return (
    <div className="sparsh-landing" ref={rootRef}>
      {/* ==================== GOV HEADER ==================== */}
      <header className="gov-header" id="gov-header">
        <div className="gov-header__inner">
          <div className="gov-header__brand">
            <img src="/ashoka_emblem.png" alt="Ashoka Emblem" className="gov-header__emblem" />
            <div className="gov-header__text">
              <span className="gov-header__line gov-header__line--en">Government of India</span>
              <span className="gov-header__line gov-header__line--ministry">Ministry of Social Justice &amp; Empowerment</span>
              <span className="gov-header__line gov-header__line--motto">सत्यमेव जयते</span>
            </div>
          </div>
          <div className="gov-header__right">
            <a href="#gov-header" className="gov-header__lang">🌐 English</a>
            <span className="gov-header__separator">|</span>
            <a href="#gov-header" className="gov-header__lang">हिन्दी</a>
          </div>
        </div>
      </header>

      {/* ==================== NAVBAR ==================== */}
      <nav className="navbar" id="navbar">
        <div className="navbar__inner">
          <Link to="/" className="navbar__logo"><span className="navbar__logo-icon">◆</span> SPARSH</Link>
          <button className="navbar__hamburger" id="hamburger" aria-label="Toggle menu">
            <span></span><span></span><span></span>
          </button>
          <ul className="navbar__links" id="nav-links">
            <li><a href="#hero" className="navbar__link navbar__link--active">Home</a></li>
            <li><a href="#reliefs" className="navbar__link">Apply</a></li>
            <li><a href="#how-it-works" className="navbar__link">Track Status</a></li>
            <li><a href="#support" className="navbar__link">Support</a></li>
            <li><Link to="/login?portal=citizen" className="navbar__link navbar__link--outline">Citizen Login</Link></li>
            <li><Link to="/login?portal=officer" className="navbar__link navbar__link--filled">Officer Login</Link></li>
          </ul>
        </div>
      </nav>

      {/* ==================== HERO ==================== */}
      <section className="hero" id="hero">
        <div className="hero__bg"></div>
        <canvas className="hero__particles" id="hero-canvas"></canvas>
        <div className="hero__grid-overlay"></div>

        <div className="trust-strip animate-on-load" style={{ '--delay': '0.2s' } as React.CSSProperties}>
          <span className="trust-strip__item"><span className="trust-strip__check">✓</span> Government Verified</span>
          <span className="trust-strip__divider"></span>
          <span className="trust-strip__item"><span className="trust-strip__check">✓</span> Aadhaar · DigiLocker · PFMS</span>
          <span className="trust-strip__divider"></span>
          <span className="trust-strip__item"><span className="trust-strip__check">✓</span> Secure &amp; Auditable</span>
        </div>

        <div className="hero__content">
          <div className="hero__brand animate-on-load" style={{ '--delay': '0.4s' } as React.CSSProperties}>
            <h2 className="hero__brand-name">S P A R S H</h2>
            <p className="hero__brand-full">Secure Platform for Authenticated Relief Settlement &amp; Handoffs</p>
          </div>
          <h1 className="hero__title animate-on-load" style={{ '--delay': '0.6s' } as React.CSSProperties}>
            Ensuring Justice. Delivering Relief.<br />
            <span className="hero__title--accent">Transparently.</span>
          </h1>
          <p className="hero__subtitle animate-on-load" style={{ '--delay': '0.8s' } as React.CSSProperties}>
            A secure Direct Benefit Transfer platform under the <strong>PCR Act (1955)</strong> &amp; <strong>PoA Act (1989)</strong>.
          </p>
          <div className="hero__ctas animate-on-load" style={{ '--delay': '1s' } as React.CSSProperties}>
            <Link to="/login?portal=citizen" className="btn btn--primary"><span className="btn__icon">📋</span> Apply for Relief</Link>
            <a href="#how-it-works" className="btn btn--secondary"><span className="btn__icon">🔍</span> Track Application</a>
            <Link to="/login?portal=citizen" className="btn btn--glass">Citizen Login</Link>
            <Link to="/login?portal=officer" className="btn btn--glass-gold">Officer Login</Link>
          </div>
        </div>

        <div className="hero__scroll-hint animate-on-load" style={{ '--delay': '1.4s' } as React.CSSProperties}>
          <span>Scroll to explore</span>
          <div className="hero__scroll-arrow"></div>
        </div>
      </section>

      {/* ==================== WAVE DIVIDER ==================== */}
      <div className="wave-divider wave-divider--1">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,40 C360,80 720,0 1080,40 C1260,55 1380,25 1440,40 L1440,80 L0,80 Z">
            <animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0,40 C360,80 720,0 1080,40 C1260,55 1380,25 1440,40 L1440,80 L0,80 Z;M0,30 C300,0 600,70 900,30 C1100,10 1300,60 1440,30 L1440,80 L0,80 Z;M0,40 C360,80 720,0 1080,40 C1260,55 1380,25 1440,40 L1440,80 L0,80 Z"/>
          </path>
        </svg>
      </div>

      {/* ==================== QUICK ACCESS & LOGIN (MERGED) ==================== */}
      <section className="quick-access" id="quick-access">
        <canvas className="section-canvas" id="canvas-quick"></canvas>
        <div className="aurora aurora--1"></div>
        <div className="aurora aurora--2"></div>

        <div className="quick-access__inner">
          <div className="section-header fade-in">
            <span className="section-badge">Quick Access</span>
            <h2 className="section-title">Get Started</h2>
            <p className="section-desc">Choose your service or login to continue</p>
          </div>

          <div className="quick-access__grid fade-in">
            <div className="qcard" style={{ '--accent': '#3B82F6' } as React.CSSProperties}>
              <div className="qcard__icon">👤</div>
              <h3>Citizen Portal</h3>
              <p>Apply for relief, upload documents, and track your case status in real-time.</p>
              <Link to="/login?portal=citizen" className="qcard__btn">Login as Citizen →</Link>
            </div>
            <div className="qcard" style={{ '--accent': '#8B5CF6' } as React.CSSProperties}>
              <div className="qcard__icon">🏛️</div>
              <h3>Officer Portal</h3>
              <p>Review applications, verify documents, approve disbursements via eSign.</p>
              <Link to="/login?portal=officer" className="qcard__btn">Login as Officer →</Link>
            </div>
            <div className="qcard" style={{ '--accent': '#10B981' } as React.CSSProperties}>
              <div className="qcard__icon">📋</div>
              <h3>Track Application</h3>
              <p>Real-time status tracking with SMS &amp; email notifications at every step.</p>
              <a href="#how-it-works" className="qcard__btn">Track Now →</a>
            </div>
            <div className="qcard" style={{ '--accent': '#F59E0B' } as React.CSSProperties}>
              <div className="qcard__icon">⚖️</div>
              <h3>Know Your Rights</h3>
              <p>Learn about protections under the PCR Act &amp; PoA Act and available reliefs.</p>
              <a href="#reliefs" className="qcard__btn">Learn More →</a>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== WAVE DIVIDER ==================== */}
      <div className="wave-divider wave-divider--2">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,50 C240,10 480,70 720,40 C960,10 1200,60 1440,30 L1440,80 L0,80 Z">
            <animate attributeName="d" dur="10s" repeatCount="indefinite" values="M0,50 C240,10 480,70 720,40 C960,10 1200,60 1440,30 L1440,80 L0,80 Z;M0,35 C360,65 600,15 900,45 C1080,55 1320,20 1440,45 L1440,80 L0,80 Z;M0,50 C240,10 480,70 720,40 C960,10 1200,60 1440,30 L1440,80 L0,80 Z"/>
          </path>
        </svg>
      </div>

      {/* ==================== LIVE STATS ==================== */}
      <section className="stats" id="stats">
        <div className="stats__bg"></div>
        <div className="stats__inner">
          <div className="stat fade-in">
            <div className="stat__icon-wrap">₹</div>
            <span className="stat__number" data-target="247.5" data-suffix=" Cr">0</span>
            <span className="stat__label">Total Funds Disbursed</span>
            <div className="stat__bar"><div className="stat__bar-fill" style={{ '--width': '82%' } as React.CSSProperties}></div></div>
          </div>
          <div className="stat fade-in">
            <div className="stat__icon-wrap">📊</div>
            <span className="stat__number" data-target="18642" data-suffix="">0</span>
            <span className="stat__label">Cases Processed</span>
            <div className="stat__bar"><div className="stat__bar-fill" style={{ '--width': '74%' } as React.CSSProperties}></div></div>
          </div>
          <div className="stat fade-in">
            <div className="stat__icon-wrap">✓</div>
            <span className="stat__number" data-target="94.7" data-suffix="%">0</span>
            <span className="stat__label">Approval Rate</span>
            <div className="stat__bar"><div className="stat__bar-fill" style={{ '--width': '95%' } as React.CSSProperties}></div></div>
          </div>
        </div>
      </section>

      {/* ==================== WAVE DIVIDER ==================== */}
      <div className="wave-divider wave-divider--3">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,40 C360,80 720,0 1080,40 C1260,55 1380,25 1440,40 L1440,80 L0,80 Z">
            <animate attributeName="d" dur="9s" repeatCount="indefinite" values="M0,40 C360,80 720,0 1080,40 C1260,55 1380,25 1440,40 L1440,80 L0,80 Z;M0,25 C300,55 720,10 1000,50 C1200,60 1350,20 1440,35 L1440,80 L0,80 Z;M0,40 C360,80 720,0 1080,40 C1260,55 1380,25 1440,40 L1440,80 L0,80 Z"/>
          </path>
        </svg>
      </div>

      {/* ==================== ABOUT SPARSH ==================== */}
      <section className="about" id="about">
        <canvas className="section-canvas" id="canvas-about"></canvas>
        <div className="aurora aurora--3"></div>
        <div className="aurora aurora--4"></div>

        <div className="about__inner">
          <div className="section-header fade-in">
            <span className="section-badge">About</span>
            <h2 className="section-title">About SPARSH</h2>
            <p className="section-desc">Secure Platform for Authenticated Relief Settlement &amp; Handoffs</p>
          </div>
          <p className="about__text fade-in">
            SPARSH is a next-generation, government-grade platform designed to digitise and streamline the disbursement of relief and rehabilitation benefits under the
            <strong> Protection of Civil Rights Act, 1955</strong> and the
            <strong> Scheduled Castes and Scheduled Tribes (Prevention of Atrocities) Act, 1989</strong>.
            Built under the Digital India initiative, it integrates with national digital infrastructure to ensure transparent, timely, and accountable Direct Benefit Transfer.
          </p>
          <div className="about__integrations fade-in">
            <div className="integration">
              <div className="integration__icon">🆔</div>
              <span>Aadhaar</span>
              <small>Identity Verification</small>
            </div>
            <div className="integration">
              <div className="integration__icon">📁</div>
              <span>DigiLocker</span>
              <small>Document Storage</small>
            </div>
            <div className="integration">
              <div className="integration__icon">💰</div>
              <span>PFMS</span>
              <small>Fund Transfer</small>
            </div>
            <div className="integration">
              <div className="integration__icon">⚖️</div>
              <span>eCourts</span>
              <small>Case Management</small>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== WAVE DIVIDER ==================== */}
      <div className="wave-divider wave-divider--4">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,30 C300,70 600,10 900,50 C1100,65 1300,20 1440,40 L1440,80 L0,80 Z">
            <animate attributeName="d" dur="7s" repeatCount="indefinite" values="M0,30 C300,70 600,10 900,50 C1100,65 1300,20 1440,40 L1440,80 L0,80 Z;M0,50 C240,15 520,65 780,35 C1000,15 1280,55 1440,25 L1440,80 L0,80 Z;M0,30 C300,70 600,10 900,50 C1100,65 1300,20 1440,40 L1440,80 L0,80 Z"/>
          </path>
        </svg>
      </div>

      {/* ==================== AVAILABLE RELIEFS ==================== */}
      <section className="reliefs" id="reliefs">
        <canvas className="section-canvas" id="canvas-reliefs"></canvas>
        <div className="aurora aurora--5"></div>

        <div className="section-header fade-in">
          <span className="section-badge">Services</span>
          <h2 className="section-title">Available Reliefs</h2>
          <p className="section-desc">Benefits available under the PCR &amp; PoA Acts</p>
        </div>
        <div className="reliefs__grid">
          <div className="relief-card fade-in" style={{ '--card-accent': '#3B82F6' } as React.CSSProperties}>
            <div className="relief-card__number">01</div>
            <div className="relief-card__icon">💵</div>
            <h3 className="relief-card__title">Monetary Relief</h3>
            <p className="relief-card__desc">Financial compensation for victims of atrocity as per the schedule of the PoA Act.</p>
            <a href="#how-it-works" className="relief-card__link">Learn More <span>→</span></a>
          </div>
          <div className="relief-card fade-in" style={{ '--card-accent': '#8B5CF6' } as React.CSSProperties}>
            <div className="relief-card__number">02</div>
            <div className="relief-card__icon">💍</div>
            <h3 className="relief-card__title">Inter-Caste Marriage</h3>
            <p className="relief-card__desc">Incentive grants promoting social integration through Dr. Ambedkar Scheme.</p>
            <a href="#how-it-works" className="relief-card__link">Learn More <span>→</span></a>
          </div>
          <div className="relief-card fade-in" style={{ '--card-accent': '#10B981' } as React.CSSProperties}>
            <div className="relief-card__number">03</div>
            <div className="relief-card__icon">🏠</div>
            <h3 className="relief-card__title">Rehabilitation Support</h3>
            <p className="relief-card__desc">Housing, land allotment, and livelihood assistance for affected families.</p>
            <a href="#how-it-works" className="relief-card__link">Learn More <span>→</span></a>
          </div>
          <div className="relief-card fade-in" style={{ '--card-accent': '#F59E0B' } as React.CSSProperties}>
            <div className="relief-card__number">04</div>
            <div className="relief-card__icon">📜</div>
            <h3 className="relief-card__title">Legal Aid</h3>
            <p className="relief-card__desc">Free legal representation and court fee waivers for victims of atrocity.</p>
            <a href="#how-it-works" className="relief-card__link">Learn More <span>→</span></a>
          </div>
        </div>
      </section>

      {/* ==================== WAVE DIVIDER ==================== */}
      <div className="wave-divider wave-divider--5">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,45 C360,10 720,70 1080,35 C1260,20 1380,55 1440,40 L1440,80 L0,80 Z">
            <animate attributeName="d" dur="11s" repeatCount="indefinite" values="M0,45 C360,10 720,70 1080,35 C1260,20 1380,55 1440,40 L1440,80 L0,80 Z;M0,30 C240,60 540,5 840,45 C1060,65 1320,15 1440,35 L1440,80 L0,80 Z;M0,45 C360,10 720,70 1080,35 C1260,20 1380,55 1440,40 L1440,80 L0,80 Z"/>
          </path>
        </svg>
      </div>

      {/* ==================== HOW IT WORKS ==================== */}
      <section className="how-it-works" id="how-it-works">
        <canvas className="section-canvas" id="canvas-how"></canvas>
        <div className="aurora aurora--6"></div>

        <div className="section-header fade-in">
          <span className="section-badge">Process</span>
          <h2 className="section-title">How It Works</h2>
          <p className="section-desc">End-to-end digital process from application to fund transfer</p>
        </div>
        <div className="stepper fade-in" id="stepper">
          <div className="stepper__track">
            <div className="stepper__track-fill" id="stepper-fill"></div>
          </div>
          <div className="stepper__step" data-step="1">
            <div className="stepper__circle"><span>1</span></div>
            <div className="stepper__content">
              <div className="stepper__icon">🆔</div>
              <h4 className="stepper__label">Register</h4>
              <p className="stepper__detail">Aadhaar eKYC</p>
            </div>
          </div>
          <div className="stepper__step" data-step="2">
            <div className="stepper__circle"><span>2</span></div>
            <div className="stepper__content">
              <div className="stepper__icon">📁</div>
              <h4 className="stepper__label">Upload Documents</h4>
              <p className="stepper__detail">DigiLocker</p>
            </div>
          </div>
          <div className="stepper__step" data-step="3">
            <div className="stepper__circle"><span>3</span></div>
            <div className="stepper__content">
              <div className="stepper__icon">🔍</div>
              <h4 className="stepper__label">Verification</h4>
              <p className="stepper__detail">By Officials</p>
            </div>
          </div>
          <div className="stepper__step" data-step="4">
            <div className="stepper__circle"><span>4</span></div>
            <div className="stepper__content">
              <div className="stepper__icon">✍️</div>
              <h4 className="stepper__label">Approval</h4>
              <p className="stepper__detail">via eSign</p>
            </div>
          </div>
          <div className="stepper__step" data-step="5">
            <div className="stepper__circle"><span>5</span></div>
            <div className="stepper__content">
              <div className="stepper__icon">💰</div>
              <h4 className="stepper__label">Fund Transfer</h4>
              <p className="stepper__detail">PFMS</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== WAVE DIVIDER ==================== */}
      <div className="wave-divider wave-divider--6">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,35 C360,65 720,15 1080,45 C1260,55 1380,30 1440,45 L1440,80 L0,80 Z">
            <animate attributeName="d" dur="9s" repeatCount="indefinite" values="M0,35 C360,65 720,15 1080,45 C1260,55 1380,30 1440,45 L1440,80 L0,80 Z;M0,50 C300,20 600,60 900,30 C1100,15 1300,55 1440,35 L1440,80 L0,80 Z;M0,35 C360,65 720,15 1080,45 C1260,55 1380,30 1440,45 L1440,80 L0,80 Z"/>
          </path>
        </svg>
      </div>

      {/* ==================== TRUST & LEGAL (MERGED) ==================== */}
      <section className="trust-legal" id="trust-legal">
        <canvas className="section-canvas" id="canvas-trust"></canvas>
        <div className="aurora aurora--7"></div>
        <div className="aurora aurora--8"></div>

        <div className="trust-legal__inner">
          <div className="section-header fade-in">
            <span className="section-badge">Trust &amp; Compliance</span>
            <h2 className="section-title">Security &amp; Legal Framework</h2>
            <p className="section-desc">Enterprise-grade safeguards backed by Indian law</p>
          </div>

          {/* Security Badges */}
          <div className="trust-legal__badges fade-in">
            <div className="badge">
              <div className="badge__icon-wrap"><span>🔒</span></div>
              <span className="badge__label">End-to-End Encryption</span>
              <div className="badge__pulse"></div>
            </div>
            <div className="badge">
              <div className="badge__icon-wrap"><span>🆔</span></div>
              <span className="badge__label">Aadhaar Verified</span>
              <div className="badge__pulse"></div>
            </div>
            <div className="badge">
              <div className="badge__icon-wrap"><span>📁</span></div>
              <span className="badge__label">DigiLocker</span>
              <div className="badge__pulse"></div>
            </div>
            <div className="badge">
              <div className="badge__icon-wrap"><span>📝</span></div>
              <span className="badge__label">Audit Logs</span>
              <div className="badge__pulse"></div>
            </div>
            <div className="badge">
              <div className="badge__icon-wrap"><span>👁️</span></div>
              <span className="badge__label">Human-in-Loop</span>
              <div className="badge__pulse"></div>
            </div>
          </div>

          {/* Legal Cards */}
          <div className="trust-legal__cards fade-in">
            <div className="legal-card">
              <div className="legal-card__accent"></div>
              <div className="legal-card__icon">📕</div>
              <h3>Protection of Civil Rights Act, 1955</h3>
              <p>Provides protection against discrimination and untouchability, with penal provisions and relief mechanisms for affected persons.</p>
            </div>
            <div className="legal-card">
              <div className="legal-card__accent"></div>
              <div className="legal-card__icon">📗</div>
              <h3>SC/ST (Prevention of Atrocities) Act, 1989</h3>
              <p>Comprehensive legislation to prevent atrocities against Scheduled Castes and Scheduled Tribes, with provisions for relief, rehabilitation, and monetary compensation.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== WAVE DIVIDER ==================== */}
      <div className="wave-divider wave-divider--7">
        <svg viewBox="0 0 1440 80" preserveAspectRatio="none">
          <path fill="currentColor" d="M0,40 C360,80 720,0 1080,40 C1260,55 1380,25 1440,40 L1440,80 L0,80 Z">
            <animate attributeName="d" dur="8s" repeatCount="indefinite" values="M0,40 C360,80 720,0 1080,40 C1260,55 1380,25 1440,40 L1440,80 L0,80 Z;M0,30 C300,0 600,55 900,25 C1100,10 1300,50 1440,30 L1440,80 L0,80 Z;M0,40 C360,80 720,0 1080,40 C1260,55 1380,25 1440,40 L1440,80 L0,80 Z"/>
          </path>
        </svg>
      </div>

      {/* ==================== SUPPORT & ACCESSIBILITY (MERGED) ==================== */}
      <section className="support" id="support">
        <canvas className="section-canvas" id="canvas-support"></canvas>
        <div className="aurora aurora--9"></div>

        <div className="support__inner">
          <div className="section-header fade-in">
            <span className="section-badge">Support &amp; Inclusion</span>
            <h2 className="section-title">Help &amp; Accessibility</h2>
            <p className="section-desc">Built for every citizen of India</p>
          </div>

          <div className="support__grid fade-in">
            <div className="support-card">
              <div className="support-card__icon">🌐</div>
              <h3>Multilingual Support</h3>
              <p>Available in 12 Indian languages including Hindi, Tamil, Telugu, Kannada, Bengali, and Marathi.</p>
              <div className="support-card__tags">
                <span>हिन्दी</span><span>தமிழ்</span><span>తెలుగు</span><span>ಕನ್ನಡ</span><span>বাংলা</span><span>मराठी</span>
              </div>
            </div>
            <div className="support-card">
              <div className="support-card__icon">🎙️</div>
              <h3>Voice Assistance</h3>
              <p>Bhashini-powered voice navigation and form filling in regional languages.</p>
              <div className="support-card__wave">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
            </div>
            <div className="support-card support-card--cta">
              <div className="support-card__icon">📢</div>
              <h3>Grievance Redressal</h3>
              <p>Face any issue? Raise a formal complaint. All grievances are tracked and resolved within stipulated SLA.</p>
              <Link to="/login?portal=citizen" className="btn btn--primary">Raise a Complaint →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer className="footer" id="footer">
        <div className="footer__top-strip">
          <div className="footer__top-inner">
            <span>🇮🇳 A Digital India Initiative</span>
            <span>|</span>
            <span>National Informatics Centre (NIC)</span>
            <span>|</span>
            <span>MeitY</span>
          </div>
        </div>
        <div className="footer__inner">
          <div className="footer__col footer__col--brand">
            <h4>
              <img src="/ashoka_emblem.png" alt="Emblem" className="footer__emblem" />
              SPARSH
            </h4>
            <p>Secure Platform for Authenticated Relief Settlement &amp; Handoffs</p>
            <p className="footer__ministry">Ministry of Social Justice &amp; Empowerment<br />Government of India</p>
          </div>
          <div className="footer__col">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="#hero">Home</a></li>
              <li><a href="#reliefs">Apply for Relief</a></li>
              <li><a href="#how-it-works">Track Status</a></li>
              <li><a href="#support">Support</a></li>
            </ul>
          </div>
          <div className="footer__col">
            <h4>Legal</h4>
            <ul>
              <li><a href="#hero">Privacy Policy</a></li>
              <li><a href="#hero">Terms &amp; Conditions</a></li>
              <li><a href="#hero">Accessibility Statement</a></li>
              <li><a href="#hero">RTI</a></li>
            </ul>
          </div>
          <div className="footer__col">
            <h4>Contact</h4>
            <ul>
              <li>📞 1800-XXX-XXXX (Toll Free)</li>
              <li>📧 support@sparsh.gov.in</li>
              <li>📍 Shastri Bhawan, New Delhi</li>
            </ul>
          </div>
        </div>
        <div className="footer__bottom">
          <p>© 2026 SPARSH — Ministry of Social Justice &amp; Empowerment, Government of India</p>
          <p>NIC | MeitY &nbsp;·&nbsp; Last Updated: 21 March 2026</p>
        </div>
      </footer>
    </div>
  );
}
