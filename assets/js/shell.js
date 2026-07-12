/* ============================================================
   Commons — shared page shell (navbar, footer, toasts, helpers)
   Usage: after store.js, call Shell.render('browse') with the
   active nav id. Pages provide <main> content themselves.
   ============================================================ */
(function () {
  const LINKS = {
    website: "https://decentralpark.nyc",
    mutualAid: "https://mutualaid.fun",
    about: "https://decentralpark.nyc/about",
    meetings: "https://decentralpark.nyc/",
    newsletter: "https://paragraph.com/@decentralpark",
    github: "https://github.com/RonTuretzky/decentralparknyc",
    instagram: "https://instagram.com/decentralparknyc",
    twitter: "https://x.com/decentralparkny",
    telegram: "https://t.me/decentralparknyc",
    farcaster: "https://farcaster.xyz/decentralpark",
    linkedin: "https://www.linkedin.com/company/decentral-park",
  };

  // Nav adapts to where you are: visitors get discovery + tools, house
  // members get the app. No dead links, no gated teases.
  function navFor() {
    const C = window.Commons;
    const hasHouse = C.account.active() && !!C.houses.mine();
    if (hasHouse) return [
      { id: "dashboard", href: "dashboard.html", label: "My House" },
      { id: "ledger", href: "ledger.html", label: "Ledger" },
      { id: "chores", href: "chores.html", label: "Chores" },
      { id: "meals", href: "meals.html", label: "Meals" },
      { id: "templates", href: "templates.html", label: "Systems" },
      { id: "browse", href: "browse.html", label: "Browse" },
      { id: "gatherings", href: "gatherings.html", label: "Gatherings" },
    ];
    return [
      { id: "browse", href: "browse.html", label: "Browse" },
      { id: "gatherings", href: "gatherings.html", label: "Gatherings" },
      { id: "templates", href: "templates.html", label: "Calculators" },
    ];
  }

  function navbar(active) {
    const C = window.Commons;
    const U = C.util;
    const account = C.account.get();
    const activeAcct = C.account.active();
    const hasHouse = activeAcct && !!C.houses.mine();
    const links = navFor().map((n) =>
      `<a href="${n.href}" class="${n.id === active ? "on" : ""}">${n.label}</a>`
    ).join("") + (!hasHouse
      ? `<a href="quiz.html" class="${active === "quiz" ? "on" : ""}">Quiz</a>` : "");
    const accountEl = activeAcct
      ? `<a href="account.html" class="row" style="gap:8px;text-decoration:none;color:var(--ink);margin-left:6px" title="Your account">
           ${avatarHtml(C.me(), "sm")}<span class="display" style="font-size:.9rem">${U.esc(account.name.split(/\s+/)[0])}</span></a>`
      : account
        ? `<a class="park-btn sm light" href="account.html" style="margin-left:6px">Sign in</a>`
        : `<a class="park-btn sm light" href="account.html" style="margin-left:6px">Create account</a>`;
    return `
    <header class="navbar">
      <div class="container nav-inner">
        <a class="brand" href="index.html">
          <img src="assets/img/logomark.png" alt="Decentral Park" />
          <span>
            <span class="word">colive<em>.fun</em></span>
            <span class="byline">by Decentral Park</span>
          </span>
        </a>
        <div class="spacer"></div>
        <nav class="nav-links" id="nav-links">${links}</nav>
        ${accountEl}
        ${hasHouse
          ? `<a class="lifted xs" href="checkin.html" style="margin-left:6px"><span class="shadow"></span><span class="face">Check-in</span></a>`
          : `<a class="lifted xs ${active === "create" ? "green" : ""}" href="create.html" style="margin-left:6px"><span class="shadow"></span><span class="face">Start a house</span></a>`}
        <button class="nav-burger" id="nav-burger" aria-label="Menu">☰</button>
      </div>
    </header>`;
  }

  function footer() {
    return `
    <footer class="footer">
      <div class="container">
        <div class="foot-inner">
          <div>
            <a class="brand" href="index.html" style="color:var(--paper-main)">
              <img src="assets/img/logomark.png" alt="" />
              <span><span class="word" style="color:var(--paper-main)">colive<em>.fun</em></span>
              <span class="byline" style="color:#9db3a6">by Decentral Park</span></span>
            </a>
            <p class="tagline">Imagining a post-capitalist world in the heart of NYC. Find your people. Share a home.</p>
          </div>
          <div>
            <h4>Solidarity apps</h4>
            <ul>
              <li><a href="${LINKS.mutualAid}" target="_blank" rel="noopener">Mutual Aid — give without giving</a></li>
              <li><a href="${LINKS.meetings}" target="_blank" rel="noopener">Meetups — gather in the park</a></li>
              <li><a href="index.html">colive.fun — find your people</a></li>
            </ul>
          </div>
          <div>
            <h4>Decentral Park</h4>
            <ul>
              <li><a href="${LINKS.about}" target="_blank" rel="noopener">About</a></li>
              <li><a href="${LINKS.newsletter}" target="_blank" rel="noopener">Newsletter</a></li>
              <li><a href="${LINKS.github}" target="_blank" rel="noopener">GitHub</a></li>
              <li>
                <a href="${LINKS.twitter}" target="_blank" rel="noopener">X</a> ·
                <a href="${LINKS.instagram}" target="_blank" rel="noopener">Instagram</a> ·
                <a href="${LINKS.telegram}" target="_blank" rel="noopener">Telegram</a> ·
                <a href="${LINKS.farcaster}" target="_blank" rel="noopener">Farcaster</a> ·
                <a href="${LINKS.linkedin}" target="_blank" rel="noopener">LinkedIn</a>
              </li>
            </ul>
          </div>
        </div>
        <div class="legal">
          <span>Local-first — your data lives on your device. Money rails run on Gnosis Chain.</span>
          <span>P2P license · Decentral Park</span>
        </div>
      </div>
    </footer>
    <div class="toast-wrap" id="toast-wrap"></div>`;
  }

  function toast(msg, kind) {
    const wrap = document.getElementById("toast-wrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .4s"; }, 2600);
    setTimeout(() => el.remove(), 3100);
  }

  // small shared renderers
  function avatarHtml(profile, size) {
    const U = window.Commons.util;
    if (!profile) return "";
    // photo/hue can arrive from another member's synced profile — never trust
    // them raw in an inline style. A photo must be a data:image URL; a hue a CSS color.
    const okPhoto = typeof profile.photo === "string" && /^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/.test(profile.photo);
    if (okPhoto) {
      return `<span class="avatar ${size || ""}" title="${U.esc(profile.name)}" style="background-image:url('${profile.photo}');background-size:cover;background-position:center;color:transparent">${U.esc(U.initials(profile.name))}</span>`;
    }
    const okHue = typeof profile.hue === "string" && /^#[0-9a-fA-F]{3,8}$|^(rgb|hsl)a?\([0-9.,%\s/]+\)$/.test(profile.hue);
    const bg = okHue ? profile.hue : U.hue(profile.id);
    return `<span class="avatar ${size || ""}" title="${U.esc(profile.name)}" style="background:${U.esc(bg)}">${U.esc(U.initials(profile.name))}</span>`;
  }
  function matchPill(m) {
    const conf = m.conflicts > 0
      ? `<span class="pill conflict">⚠ ${m.conflicts} dealbreaker${m.conflicts > 1 ? "s" : ""}</span>`
      : `<span class="pill zero">0 dealbreakers</span>`;
    // Bands, not percentages — the % implied a prediction nobody can make
    const cls = m.band === "strong" ? "match" : m.band === "workable" ? "paper" : "warn";
    const label = m.bandLabel || (m.band ? m.band : m.score + "%");
    return `<span class="pill ${cls}">${label}</span> ${conf}`;
  }

  function render(active) {
    document.body.insertAdjacentHTML("afterbegin", navbar(active));
    document.body.insertAdjacentHTML("beforeend", footer());
    const burger = document.getElementById("nav-burger");
    if (burger) burger.addEventListener("click", () => document.getElementById("nav-links").classList.toggle("open"));
    installPwa();
    installSync();
  }

  // PWA: manifest + service worker, injected here so every page gets both
  // without repeating <head> boilerplate. Chrome processes dynamic manifests.
  function installSync() {
    if (window.CloudSync || document.querySelector('script[data-cloud-sync]')) return;
    const sc = document.createElement("script");
    sc.src = "assets/js/sync.js";
    sc.dataset.cloudSync = "1";
    document.body.appendChild(sc);
  }

  function installPwa() {
    if (!document.querySelector('link[rel="manifest"]')) {
      document.head.insertAdjacentHTML("beforeend",
        '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#0d9488">');
    }
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  // Auth gate for app pages: no active account → straight to the auth page,
  // like any app with a front door. Call right after Shell.render().
  function gate() {
    const C = window.Commons;
    if (C.account.active()) return false;
    location.replace("account.html");
    return true;
  }

  // true while the user is typing in a field — pages skip sync:update re-renders
  // then, so a housemate's incoming change can't wipe an in-progress form
  function editing() {
    const el = document.activeElement;
    return !!(el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  }

  window.Shell = { render, gate, toast, avatarHtml, matchPill, editing, LINKS };
})();
