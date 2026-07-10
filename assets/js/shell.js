/* ============================================================
   Commons — shared page shell (navbar, footer, toasts, helpers)
   Usage: after store.js, call Shell.render('browse') with the
   active nav id. Pages provide <main> content themselves.
   ============================================================ */
(function () {
  const LINKS = {
    website: "https://decentralpark.nyc",
    about: "https://decentralpark.nyc/about",
    meetings: "https://decentralpark.nyc/meetings",
    newsletter: "https://paragraph.com/@decentralpark",
    github: "https://github.com/RonTuretzky/decentralparknyc",
    instagram: "https://instagram.com/decentralparknyc",
    twitter: "https://x.com/decentralparkny",
    telegram: "https://t.me/decentralparknyc",
    farcaster: "https://farcaster.xyz/decentralpark",
    linkedin: "https://www.linkedin.com/company/decentral-park",
  };

  const NAV = [
    { id: "browse", href: "browse.html", label: "Browse" },
    { id: "gatherings", href: "gatherings.html", label: "Gatherings" },
    { id: "dashboard", href: "dashboard.html", label: "My House" },
    { id: "ledger", href: "ledger.html", label: "Ledger" },
    { id: "chores", href: "chores.html", label: "Chores" },
    { id: "meals", href: "meals.html", label: "Meals" },
    { id: "templates", href: "templates.html", label: "Systems" },
    { id: "steward", href: "steward.html", label: "Steward" },
  ];

  function navbar(active) {
    const links = NAV.map((n) =>
      `<a href="${n.href}" class="${n.id === active ? "on" : ""}">${n.label}</a>`
    ).join("");
    return `
    <div class="demo-banner">Demo world — everything lives in your browser.
      <button type="button" id="demo-reset">Reset the demo</button>
    </div>
    <header class="navbar">
      <div class="container nav-inner">
        <a class="brand" href="index.html">
          <img src="assets/img/logomark.png" alt="Decentral Park" />
          <span>
            <span class="word">Comm<em>o</em>ns</span>
            <span class="byline">by Decentral Park</span>
          </span>
        </a>
        <div class="spacer"></div>
        <nav class="nav-links" id="nav-links">${links}
          <a href="quiz.html" class="${active === "quiz" ? "on" : ""}">Quiz</a>
        </nav>
        <a class="lifted xs ${active === "create" ? "green" : ""}" href="create.html" style="margin-left:6px"><span class="shadow"></span><span class="face">Start a house</span></a>
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
              <span><span class="word" style="color:var(--paper-main)">Comm<em>o</em>ns</span>
              <span class="byline" style="color:#9db3a6">by Decentral Park</span></span>
            </a>
            <p class="tagline">Imagining a post-capitalist world in the heart of NYC. Find your people. Share a home.</p>
          </div>
          <div>
            <h4>Solidarity apps</h4>
            <ul>
              <li><a href="${LINKS.website}" target="_blank" rel="noopener">Mutual Aid — give without giving</a></li>
              <li><a href="${LINKS.meetings}" target="_blank" rel="noopener">Meetups — gather in the park</a></li>
              <li><a href="index.html">Commons — build together</a></li>
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
          <span>Commons is a demo prototype — no real money, houses, or housemates were harmed.</span>
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
    return `<span class="avatar ${size || ""}" title="${U.esc(profile.name)}" style="background:${U.hue(profile.id)}">${U.esc(U.initials(profile.name))}</span>`;
  }
  function matchPill(m) {
    const conf = m.conflicts > 0
      ? `<span class="pill conflict">⚠ ${m.conflicts} dealbreaker${m.conflicts > 1 ? "s" : ""}</span>`
      : `<span class="pill zero">0 dealbreakers</span>`;
    return `<span class="pill match">${m.score}% match</span> ${conf}`;
  }

  function render(active) {
    document.body.insertAdjacentHTML("afterbegin", navbar(active));
    document.body.insertAdjacentHTML("beforeend", footer());
    const burger = document.getElementById("nav-burger");
    if (burger) burger.addEventListener("click", () => document.getElementById("nav-links").classList.toggle("open"));
    const reset = document.getElementById("demo-reset");
    if (reset) reset.addEventListener("click", () => { window.Commons.reset(); toast("Demo world reseeded"); setTimeout(() => location.reload(), 500); });
  }

  window.Shell = { render, toast, avatarHtml, matchPill, LINKS };
})();
