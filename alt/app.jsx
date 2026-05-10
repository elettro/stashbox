/* === Stashbox — Site App (Psychedelic Reggae-Rock) === */
const { useState, useEffect, useRef } = React;

const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentMode": "gold",
  "showGrain": true,
  "subscriberCount": "12.4K"
}/*EDITMODE-END*/;

/* === SUNBURST (decorative behind hero) === */
function Sunburst() {
  const rays = [];
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * 360;
    const w = i % 2 === 0 ? 4 : 2;
    rays.push(
      <rect key={i} x={350 - w/2} y="0" width={w} height="350"
        fill={i % 3 === 0 ? '#d49533' : i % 3 === 1 ? '#b8341c' : '#4a6a32'}
        opacity={i % 2 === 0 ? 0.5 : 0.3}
        transform={`rotate(${angle} 350 350)`} />
    );
  }
  return (
    <svg className="hero-sunburst" viewBox="0 0 700 700" aria-hidden="true">
      <g>{rays}</g>
      <circle cx="350" cy="350" r="120" fill="#d49533" opacity="0.13" />
      <circle cx="350" cy="350" r="60" fill="#b8341c" opacity="0.10" />
    </svg>
  );
}

/* === NAV === */
function Nav({ onSubscribe }) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <a href="#top" className="nav-logo">
          <span className="sun"></span>
          STASHBOX
        </a>
        <div className="nav-links">
          <a href="#about">About</a>
          <a href="#shows">Shows</a>
          <a href="#music">Music</a>
          <a href="#merch">Merch</a>
          <a href="#booking">Booking</a>
        </div>
        <a href="#" className="nav-cta" onClick={onSubscribe}>
          ▶ Subscribe
        </a>
      </div>
    </nav>
  );
}

/* === HERO === */
function Hero({ playing, setPlaying, subCount, onSubscribe }) {
  return (
    <section className="hero" id="top" data-screen-label="01 Hero">
      <Sunburst />
      <div className="hero-bg" />
      <div className="container hero-grid">
        <div className="hero-title-wrap">
          <div className="hero-eyebrow">
            <span className="chip">
              <span className="dot"></span>
              South Florida · Est. 2019
            </span>
          </div>
          <h1 className="hero-title">
            <span className="stash">STASH</span>
            <span className="box">BOX</span>
            <span className="hero-scribble">good vibes only ✦</span>
          </h1>
          <div className="hero-tagline">
            <span><span className="star">★</span> Sun-soaked Reggae Rock</span>
            <span><span className="star">★</span> Saltwater &amp; Smoke</span>
            <span><span className="star">★</span> Loud as Hell</span>
          </div>
          <div className="hero-ctas">
            <a href="#" className="btn btn-yt" onClick={onSubscribe}>
              <YTGlyph /> Subscribe on YouTube
            </a>
            <a href="#shows" className="btn btn-ghost">
              Book Us →
            </a>
          </div>
          <div className="hero-meta">
            <div>
              <strong>{subCount}</strong>
              <span>Subscribers</span>
            </div>
            <div>
              <strong>1.2M</strong>
              <span>Views</span>
            </div>
            <div>
              <strong>187</strong>
              <span>Shows Played</span>
            </div>
          </div>
        </div>
        <div className="video-card">
          <div className="video-card-frame video-frame">
            {playing ? (
              <iframe
                src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0"
                title="Stashbox - Latest"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="placeholder" onClick={() => setPlaying(true)}>
                <div className="play-btn"></div>
                <div className="placeholder-title">"Saltwater Sermon"</div>
                <div className="placeholder-sub">OFFICIAL VIDEO · 4:12</div>
              </div>
            )}
          </div>
          <div className="video-card-meta">
            <span className="new">NEW VIDEO · MAY '26</span>
            <span>STASHBOX OFFICIAL</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function YTGlyph() {
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" fill="none" aria-hidden="true">
      <rect x="0.5" y="0.5" width="21" height="15" rx="3" fill="currentColor" opacity="0.2" stroke="currentColor" strokeWidth="1.5"/>
      <polygon points="9,4.5 15,8 9,11.5" fill="currentColor"/>
    </svg>
  );
}

/* === ABOUT === */
function About() {
  return (
    <section className="about" id="about" data-screen-label="02 About">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="section-num">02 / Who We Are</span>
            <h2 className="section-title">The <span className="accent">Band</span></h2>
          </div>
          <span className="chip">
            <span className="dot"></span>
            Hollywood Beach · 2019
          </span>
        </div>
        <div className="about-grid">
          <div className="about-photo">
            <div className="frame"></div>
            <div className="stamp">FT. LAUDERDALE '24</div>
          </div>
          <div className="about-text">
            <p className="lead">
              Four kids from the wrong side of the bridge, born of <span className="highlight">cheap beer</span>,
              salt-rusted Telecasters, and a stubborn refusal to play anything
              that didn't make the floor sweat.
            </p>
            <p>
              Stashbox plays <span className="hand">sun-soaked</span> reggae-rock —
              equal parts dive-bar gospel and front-porch reverie. We grew up between
              Hollywood Beach and Little Haiti, raised on classic FM radio and the kind
              of sets that don't end until somebody's crying or kissing.
            </p>
            <p>
              Our records are made the same way: slow, warm, a little crooked, mixed loud.
              See you in the pit.
            </p>
            <div className="about-stats">
              <div className="stat"><strong>4</strong><span>Members</span></div>
              <div className="stat"><strong>2</strong><span>LPs Out</span></div>
              <div className="stat"><strong>187</strong><span>Shows Played</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* === SHOWS === */
function Shows({ onBook }) {
  return (
    <section className="shows" id="shows" data-screen-label="03 Shows">
      <div className="shows-marquee">
        <div className="shows-marquee-track">
          ★ OFF THE ROAD ★ WRITING NEW SONGS ★ BOOK US FOR YOUR THING ★ OFF THE ROAD ★ WRITING NEW SONGS ★ BOOK US FOR YOUR THING ★&nbsp;
        </div>
      </div>
      <div className="container" style={{ paddingTop: 30 }}>
        <div className="section-head">
          <div>
            <span className="section-num">03 / Catch Us Live</span>
            <h2 className="section-title">No Dates <span className="red">Yet</span></h2>
          </div>
          <span className="chip">
            <span className="dot"></span>
            Off the road · Booking now
          </span>
        </div>
        <div className="shows-empty">
          <div className="shows-empty-glyph" aria-hidden="true">
            <span>★</span>
          </div>
          <div className="shows-empty-copy">
            <h3>Between tours.</h3>
            <p>We're holed up writing the next record. No public dates on the books — but we're saying yes to the right rooms, festivals, and weird private parties.</p>
            <p className="shows-empty-sub">Want to be the first to know when we announce? Drop your email in the footer, or pitch us a show below.</p>
          </div>
        </div>
        <div className="shows-cta-block" id="booking">
          <div>
            <h3>Want us at <span className="accent">your</span> venue, festival, or backyard luau?</h3>
            <p>Wide open calendar · will travel for tacos</p>
          </div>
          <button className="btn btn-gold" onClick={onBook}>
            Book Stashbox →
          </button>
        </div>
      </div>
    </section>
  );
}

/* === MUSIC === */
const VIDEOS = [
  { title: 'Saltwater Sermon (Official Video)', views: '482K views · 3 weeks ago', dur: '4:12', featured: true },
  { title: 'Last Bus to Hollywood', views: '218K views · 2 mo ago', dur: '3:48' },
  { title: 'Live at Revolution', views: '94K views · 5 mo ago', dur: '5:21' },
  { title: 'Backseat Hymn (Acoustic)', views: '156K views · 7 mo ago', dur: '3:02' },
  { title: 'Studio Sessions Vol. 2', views: '63K views · 9 mo ago', dur: '6:44' }
];

function Music({ onSubscribe, subCount }) {
  return (
    <section className="music" id="music" data-screen-label="04 Music">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="section-num">04 / Watch &amp; Listen</span>
            <h2 className="section-title">Latest <span className="green">Cuts</span></h2>
          </div>
          <span className="chip">
            <span className="dot"></span>
            New Video Every Month
          </span>
        </div>
        <div className="music-grid">
          {VIDEOS.map((v, i) => (
            <div key={i} className={`video-tile ${v.featured ? 'featured' : ''}`}>
              <div className="thumb">
                <div className="play"></div>
                <span className="duration">{v.dur}</span>
              </div>
              <div className="meta">
                <h4>{v.title}</h4>
                <div className="views">{v.views}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="youtube-banner">
          <div className="yt-icon"></div>
          <div>
            <h3>Don't miss a single drop.</h3>
            <p>{subCount} subscribers strong · new tracks · live cuts · backstage chaos</p>
          </div>
          <a href="#" className="btn" onClick={onSubscribe}>
            Subscribe Now →
          </a>
        </div>
      </div>
    </section>
  );
}

/* === MERCH === */
const MERCH = [
  { title: 'Saltwater Sermon Tee', sub: 'Heavyweight · Oatmeal', price: '$28', tag: 'NEW' },
  { title: "Tour Poster '26", sub: '18×24 · Letterpress', price: '$22', tag: null },
  { title: 'Pelican Trucker Hat', sub: 'Snapback · Faded Red', price: '$34', tag: 'LOW STOCK' },
  { title: 'Stashbox LP — Vinyl', sub: '180g · Amber Splatter', price: '$32', tag: null }
];

function Merch() {
  return (
    <section className="merch" id="merch" data-screen-label="05 Merch">
      <div className="container">
        <div className="section-head">
          <div>
            <span className="section-num">05 / Pack the Tour Van</span>
            <h2 className="section-title">The <span className="turquoise">Goods</span></h2>
          </div>
          <a href="#" className="btn btn-ghost" onClick={(e) => e.preventDefault()}>
            Full Shop →
          </a>
        </div>
        <div className="merch-grid">
          {MERCH.map((m, i) => (
            <div key={i} className="merch-card">
              {m.tag && <div className="merch-tag">{m.tag}</div>}
              <div className="image">
                <span className="label">{m.title.split(' ')[0]}</span>
              </div>
              <div className="info">
                <div>
                  <h4>{m.title}</h4>
                  <div className="sub">{m.sub}</div>
                </div>
                <div className="price">{m.price}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* === FOOTER === */
function Footer({ onBook, onSubscribe }) {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-cta">
          <h2>
            Tune <span className="accent">In</span>.<br/>
            Turn it <span className="red">Up</span>.
          </h2>
          <p>One-click subscribe · See you in the comments</p>
          <a href="#" className="btn btn-yt" onClick={onSubscribe}>
            <YTGlyph /> Subscribe on YouTube
          </a>
        </div>

        <div className="footer-grid">
          <div className="footer-brand">
            <div className="logo">
              <span className="sun"></span>
              STASHBOX
            </div>
            <p>Sun-soaked reggae rock from the broken edge of South Florida. Salt in the strings, sand in the snare.</p>
            <div className="footer-social">
              <a href="#" className="social-btn" title="YouTube">YT</a>
              <a href="#" className="social-btn" title="Instagram">IG</a>
              <a href="#" className="social-btn" title="Spotify">SP</a>
              <a href="#" className="social-btn" title="Bandcamp">BC</a>
              <a href="#" className="social-btn" title="TikTok">TT</a>
            </div>
          </div>
          <div>
            <h5>Visit</h5>
            <ul>
              <li><a href="#about">About</a></li>
              <li><a href="#shows">Shows</a></li>
              <li><a href="#music">Music</a></li>
              <li><a href="#merch">Merch</a></li>
            </ul>
          </div>
          <div>
            <h5>Listen</h5>
            <ul>
              <li><a href="#">YouTube</a></li>
              <li><a href="#">Spotify</a></li>
              <li><a href="#">Apple Music</a></li>
              <li><a href="#">Bandcamp</a></li>
            </ul>
          </div>
          <div>
            <h5>Booking</h5>
            <ul>
              <li><a href="mailto:book@stashbox.com">book@stashbox.com</a></li>
              <li><a href="mailto:press@stashbox.com">press@stashbox.com</a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); onBook(); }}>Inquiry Form →</a></li>
              <li><a href="tel:+19545550114">(954) 555-0114</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© Stashbox '26 — All rights reserved</span>
          <span>Hand-built in Hollywood, FL · One love</span>
        </div>
      </div>
    </footer>
  );
}

/* === BOOKING MODAL === */
function BookingModal({ onClose }) {
  const [submitted, setSubmitted] = useState(false);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        {submitted ? (
          <div>
            <h3>★ <span className="accent">Got it</span> ★</h3>
            <p className="modal-sub">We'll holler back within 48 hrs</p>
            <p style={{ marginBottom: 16 }}>Until then — crack a beer, blast the new single, and send us pictures of the venue. The boys are stoked.</p>
            <div className="modal-actions">
              <button className="btn btn-gold" onClick={onClose}>Right on</button>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
            <h3>Book <span className="accent">Stashbox</span></h3>
            <p className="modal-sub">Tell us where & when</p>
            <div className="modal-row">
              <div>
                <label>Your Name</label>
                <input type="text" required defaultValue="" placeholder="Jane Promoter" />
              </div>
              <div>
                <label>Email</label>
                <input type="email" required placeholder="you@venue.com" />
              </div>
            </div>
            <label>Venue / Event</label>
            <input type="text" required placeholder="Revolution Live, Ft. Lauderdale" />
            <div className="modal-row">
              <div>
                <label>Date</label>
                <input type="date" required />
              </div>
              <div>
                <label>Capacity</label>
                <select>
                  <option>0–200</option>
                  <option>200–600</option>
                  <option>600–1500</option>
                  <option>1500+</option>
                </select>
              </div>
            </div>
            <label>Anything else?</label>
            <textarea placeholder="Backline, support acts, your nephew's bar mitzvah..."></textarea>
            <div className="modal-actions">
              <button type="submit" className="btn btn-gold">Send Inquiry →</button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/* === TWEAKS PANEL === */
function StashboxTweaks({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection title="Primary Accent">
        <TweakRadio
          label="Hero accent color"
          value={tweaks.accentMode}
          options={[
            { value: 'gold', label: 'Gold' },
            { value: 'red', label: 'Red' },
            { value: 'green', label: 'Green' },
            { value: 'turquoise', label: 'Olive' }
          ]}
          onChange={(v) => setTweak('accentMode', v)}
        />
      </TweakSection>
      <TweakSection title="Texture">
        <TweakToggle
          label="Film grain overlay"
          value={tweaks.showGrain}
          onChange={(v) => setTweak('showGrain', v)}
        />
      </TweakSection>
      <TweakSection title="Counts">
        <TweakText
          label="YouTube subscriber count"
          value={tweaks.subscriberCount}
          onChange={(v) => setTweak('subscriberCount', v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

const ACCENT_MAP = {
  gold: '#e0a82a',
  red: '#b8341c',
  green: '#4a6a32',
  turquoise: '#7a8b3c'
};

/* === APP === */
function App() {
  const [tweaks, setTweak] = useTweaks(TWEAKS_DEFAULTS);
  const [playing, setPlaying] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showBooking, setShowBooking] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--accent', ACCENT_MAP[tweaks.accentMode] || ACCENT_MAP.gold);
  }, [tweaks.accentMode]);

  useEffect(() => {
    if (!tweaks.showGrain) document.body.classList.add('no-grain');
    else document.body.classList.remove('no-grain');
  }, [tweaks.showGrain]);

  const handleSubscribe = (e) => {
    if (e) e.preventDefault();
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3200);
    window.open('https://youtube.com', '_blank', 'noopener');
  };

  return (
    <div className="app">
      <Nav onSubscribe={handleSubscribe} />
      <Hero
        playing={playing}
        setPlaying={setPlaying}
        subCount={tweaks.subscriberCount}
        onSubscribe={handleSubscribe}
      />
      <About />
      <Shows onBook={() => setShowBooking(true)} />
      <Music onSubscribe={handleSubscribe} subCount={tweaks.subscriberCount} />
      <Merch />
      <Footer onBook={() => setShowBooking(true)} onSubscribe={handleSubscribe} />

      <div className={`toast ${showToast ? 'show' : ''}`}>
        <span className="check">✓</span>
        Thanks for subscribing — see you in the comments
      </div>

      {showBooking && <BookingModal onClose={() => setShowBooking(false)} />}

      <StashboxTweaks tweaks={tweaks} setTweak={setTweak} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
