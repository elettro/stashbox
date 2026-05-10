/* === Stashbox — Site App (Psychedelic Reggae-Rock) === */
const { useState, useEffect, useRef } = React;

const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentMode": "gold",
  "showGrain": true,
  "subscriberCount": "6.5K+"
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
              South Florida · Tribute + Originals
            </span>
          </div>
          <h1 className="hero-title">
            <span className="stash">STASH</span>
            <span className="box">BOX</span>
            <span className="hero-scribble">good vibes only ✦</span>
          </h1>
          <div className="hero-tagline">
            <span><span className="star">★</span> Rock · Reggae · Blues · Funk</span>
            <span><span className="star">★</span> Bob Dylan · Sublime · Classic Reggae</span>
            <span><span className="star">★</span> South Florida + Beyond</span>
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
                src="https://www.youtube.com/embed/KWE3M2XVYZY?autoplay=1&rel=0"
                title="Stashbox - Latest"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="placeholder" onClick={() => setPlaying(true)}>
                <div className="play-btn"></div>
                <div className="placeholder-title">Stashbox Live Reel</div>
                <div className="placeholder-sub">BOOKING HIGHLIGHTS · YOUTUBE</div>
              </div>
            )}
          </div>
          <div className="video-card-meta">
            <span className="new">FEATURED VIDEO</span>
            <span>@stashboxband</span>
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
            Available for Booking
          </span>
        </div>
        <div className="about-grid">
          <div className="about-photo">
            <div className="frame"></div>
            <div className="stamp">FT. LAUDERDALE '24</div>
          </div>
          <div className="about-text">
            <p className="lead">
              Stashbox is a South Florida live band blending <span className="highlight">rock, reggae, blues, funk</span>,
              and original songs into a high-energy show built for festivals, venues,
              resorts, and private events.
            </p>
            <p>
              The band is known for crowd-favorite tribute sets including
              <span className="hand"> Stashbox Does Dylan</span>, a full Sublime set, and classic reggae
              featuring Bob Marley and Toots &amp; The Maytals. Every booking can be
              tailored from a mixed dance set to a full tribute-night format.
            </p>
            <p>
              From club stages to destination events, Stashbox delivers a full-band
              production and a flexible setlist designed for the room.
            </p>
            <div className="about-stats">
              <div className="stat"><strong>6.5K+</strong><span>YouTube Subs</span></div>
              <div className="stat"><strong>3</strong><span>Tribute Formats</span></div>
              <div className="stat"><strong>South FL</strong><span>Home Base</span></div>
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
            <h2 className="section-title">Now <span className="red">Booking</span></h2>
          </div>
          <span className="chip">
            <span className="dot"></span>
            Festivals · Resorts · Clubs · Private Events
          </span>
        </div>
        <div className="shows-empty">
          <div className="shows-empty-glyph" aria-hidden="true">
            <span>★</span>
          </div>
          <div className="shows-empty-copy">
            <h3>Built for live crowds.</h3>
            <p>Book Stashbox for a full-night live set or a centerpiece tribute show. Ideal for music rooms, beach venues, cruise entertainment, branded events, and community festivals.</p>
            <p className="shows-empty-sub">Call 310.408.6687 or send your event details below for availability and production needs.</p>
          </div>
        </div>
        <div className="shows-cta-block" id="booking">
          <div>
            <h3>Need a <span className="accent">headline-ready</span> live band for your event?</h3>
            <p>Tribute sets + originals · full production · travel available with budget</p>
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
  { title: 'Sublime Highlight Reel — Stashbox', views: 'Featured channel reel', dur: '3:38', featured: true, youtubeId: '0GKeOZ3fDgw' },
  { title: 'Fish House, Miami', views: 'Live performance', dur: '4:08', youtubeId: 'ygvrFB1cn54' },
  { title: 'Dylan Tribute · Peter Roland', views: 'Stashbox Does Dylan', dur: '5:13', youtubeId: '7IIB63ZAeH0' },
  { title: 'Stashbox Live Performance', views: 'Full band set clip', dur: '4:28', youtubeId: 'W-zqAcTEajg' },
  { title: 'Reggae & Rock Set', views: 'Live room energy', dur: '4:19', youtubeId: 'CIV_s42AnMs' }
];

function Music({ onSubscribe, subCount }) {
  const [activeVideoId, setActiveVideoId] = useState(VIDEOS[0].youtubeId);
  const activeVideo = VIDEOS.find((v) => v.youtubeId === activeVideoId) || VIDEOS[0];

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
            Real clips from @stashboxband
          </span>
        </div>
        <div className="music-grid music-player-layout">
          <article className="video-tile featured active-player">
            <div className="thumb">
              <iframe
                src={`https://www.youtube.com/embed/${activeVideo.youtubeId}?rel=0&autoplay=1`}
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
              <span className="duration">{activeVideo.dur}</span>
            </div>
            <div className="meta">
              <h4>{activeVideo.title}</h4>
              <div className="views">{activeVideo.views}</div>
            </div>
          </article>

          <div className="video-list">
            {VIDEOS.map((v, i) => (
              <button key={i} className={`video-tile video-select ${v.youtubeId === activeVideoId ? 'is-active' : ''}`} onClick={() => setActiveVideoId(v.youtubeId)}>
                <div className="thumb">
                  <img src={`https://img.youtube.com/vi/${v.youtubeId}/hqdefault.jpg`} alt={`${v.title} thumbnail`} loading="lazy" />
                  <div className="play"></div>
                  <span className="duration">{v.dur}</span>
                </div>
                <div className="meta">
                  <h4>{v.title}</h4>
                  <div className="views">{v.views}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="youtube-banner">
          <div className="yt-icon"></div>
          <div>
            <h3>Don't miss a single drop.</h3>
            <p>{subCount} subscribers strong · new tracks · live cuts · backstage chaos</p>
          </div>
          <a href="https://www.youtube.com/@stashboxband?sub_confirmation=1" target="_blank" rel="noreferrer" className="btn" onClick={onSubscribe}>
            Subscribe Now →
          </a>
        </div>
      </div>
    </section>
  );
}

/* === MERCH === */
const MERCH = [
  { title: 'Official Stashbox Collection', sub: 'Apparel + accessories', price: 'Shop', tag: 'LIVE' },
  { title: 'Tribute Show Promos', sub: 'Dylan · Reggae · Sublime', price: 'Media', tag: null },
  { title: 'Band Branding Assets', sub: 'Logos + social-ready art', price: 'Assets', tag: null },
  { title: 'Channel + Event Drops', sub: 'New releases & collabs', price: 'Updates', tag: null }
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
          <a href="https://stashbox.ai/collections/stashbox" target="_blank" rel="noreferrer" className="btn btn-ghost">
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
            <p>South Florida live band performing rock, reggae, blues, funk, and originals — plus full tribute formats for Dylan, Sublime, and classic reggae nights.</p>
            <div className="footer-social">
              <a href="https://www.youtube.com/@stashboxband" target="_blank" rel="noreferrer" className="social-btn" title="YouTube">YT</a>
              <a href="https://stashbox.ai" target="_blank" rel="noreferrer" className="social-btn" title="Stashbox">SB</a>
              <a href="https://stashbox.ai/collections/stashbox" target="_blank" rel="noreferrer" className="social-btn" title="Merch">ME</a>
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
              <li><a href="https://www.youtube.com/@stashboxband" target="_blank" rel="noreferrer">YouTube</a></li>
              <li><a href="/stashbox/themaninme/" target="_blank" rel="noreferrer">The Man In Me</a></li>
              <li><a href="/stashbox/bloodinmyeyes/" target="_blank" rel="noreferrer">Blood In My Eyes</a></li>
              <li><a href="/stashbox/visionsofjohanna/" target="_blank" rel="noreferrer">Visions of Johanna</a></li>
            </ul>
          </div>
          <div>
            <h5>Booking</h5>
            <ul>
              <li><a href="mailto:booking@stashbox.com">booking@stashbox.com</a></li>
              <li><a href="tel:3104086687">310.408.6687</a></li>
              <li><a href="#" onClick={(e) => { e.preventDefault(); onBook(); }}>Inquiry Form →</a></li>
              <li><a href="/stashbox/booking/" target="_blank" rel="noreferrer">Booking Page →</a></li>
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
    window.open('https://www.youtube.com/@stashboxband?sub_confirmation=1', '_blank', 'noopener');
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
