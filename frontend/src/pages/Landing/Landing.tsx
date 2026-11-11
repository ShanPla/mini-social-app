import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pause, Play } from 'lucide-react';
import { prefetchPage } from '../../lib/pages';
import { useMediaQuery } from '../../lib/useMediaQuery';
import './Landing.css';

/*
 * The front page for people who are not signed in (signed in, "/" goes to the
 * feed). It says what the site is and shows it: the video is a recording of
 * the real app with made-up people in it (public/demo.*).
 */
const FEATURES: { title: string; text: string }[] = [
  { title: 'Words and photos', text: 'Write a post and add up to ten photos. Choose who sees it: everyone, your followers, or only you.' },
  { title: 'A feed in order', text: 'Newest first, from everyone or only the people you follow. Nothing is ranked or pushed at you.' },
  { title: 'Private conversations', text: 'Direct messages and group chats, with replies, reactions and photos, as they happen.' },
  { title: 'Yours to control', text: 'Block people, report what does not belong, and delete your account with everything in it whenever you like.' },
];

/* Two recordings of the same tour: the desktop one is unreadable at phone
   width, so small screens get the one filmed at phone size */
const DEMOS = {
  wide: { webm: '/demo.webm', mp4: '/demo.mp4', poster: '/demo-poster.jpg', width: 1280, height: 720 },
  phone: { webm: '/demo-phone.webm', mp4: '/demo-phone.mp4', poster: '/demo-phone-poster.jpg', width: 390, height: 844 },
};

export default function Landing() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const small = useMediaQuery('(max-width: 700px)');
  const demo = small ? DEMOS.phone : DEMOS.wide;
  /* The bar offers [Create account] only once the big button has scrolled
     away: side by side at the top they said the same thing twice */
  const heroCtaRef = useRef<HTMLAnchorElement>(null);
  const [heroCtaOnScreen, setHeroCtaOnScreen] = useState(true);

  useEffect(() => {
    const cta = heroCtaRef.current;
    if (!cta || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => setHeroCtaOnScreen(entry.isIntersecting), { rootMargin: '-60px 0px 0px 0px' });
    observer.observe(cta);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.title = 'The Chronicle — share your story, one post at a time';
    return () => { document.title = 'The Chronicle'; };
  }, []);

  /* The demo plays by itself while it is on screen, without sound. People who
     asked their device for less motion get the still picture and a Play button. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window)) return;
    /* Pausing with the button must not be undone by the next scroll */
    let stoppedByReader = false;
    const onPause = () => { if (video.dataset.byReader === 'yes') stoppedByReader = true; };
    const onPlay = () => { stoppedByReader = false; };
    video.addEventListener('pause', onPause);
    video.addEventListener('play', onPlay);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        if (!stoppedByReader) video.play().catch(() => undefined);
      } else if (!video.paused) {
        video.dataset.byReader = 'no';
        video.pause();
      }
    }, { threshold: 0.35 });
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.removeEventListener('pause', onPause);
      video.removeEventListener('play', onPlay);
    };
    /* A different recording is a different video element */
  }, [small]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => undefined);
    } else {
      video.dataset.byReader = 'yes';
      video.pause();
    }
  };

  /* The pages the buttons lead to, fetched while the reader is still deciding */
  const warm = () => { prefetchPage('register'); prefetchPage('login'); };

  return (
    <div className="landing">
      <header className="landing-bar">
        <div className="landing-bar-inner">
          <span className="landing-name">
            <span className="landing-name-the">The</span>
            <span className="landing-name-main">Chronicle</span>
          </span>
          <nav className="landing-bar-links" aria-label="Account">
            <Link to="/login" className="landing-signin" onMouseEnter={warm} onFocus={warm}>Sign in</Link>
            <Link
              to="/register"
              className={`btn-primary landing-cta-small ${heroCtaOnScreen ? 'landing-cta-small--away' : ''}`}
              aria-hidden={heroCtaOnScreen}
              tabIndex={heroCtaOnScreen ? -1 : undefined}
              onMouseEnter={warm}
              onFocus={warm}
            >
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <h1>
            Share your story,<br />
            <em>one post at a time.</em>
          </h1>
          <p className="landing-lede">
            The Chronicle is a small social space for posts, photos and conversations.
            No ads, and no algorithm deciding what you see.
          </p>
          <div className="landing-actions">
            <Link ref={heroCtaRef} to="/register" className="btn-primary landing-cta" onMouseEnter={warm} onFocus={warm}>Create an account</Link>
          </div>
        </section>

        <section className="landing-demo" aria-label="A look inside">
          <figure className="landing-frame">
            {/* Shown as what it is: a browser window, or a phone on small screens */}
            <div className={small ? 'landing-device landing-device--phone' : 'landing-device landing-device--window'}>
              {!small && (
                <div className="landing-window-bar" aria-hidden="true">
                  <span className="landing-window-dots"><i /><i /><i /></span>
                  <span className="landing-window-title">The Chronicle</span>
                </div>
              )}
              <video
                key={demo.mp4}
                ref={videoRef}
                className="landing-video"
                poster={demo.poster}
                muted
                loop
                playsInline
                preload="metadata"
                width={demo.width}
                height={demo.height}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                aria-label="A recording of The Chronicle: the feed, a post with photos and comments, a chat, a profile and dark mode"
              >
                <source src={demo.webm} type="video/webm" />
                <source src={demo.mp4} type="video/mp4" />
              </video>
            </div>
            <div className="landing-caption">
              <figcaption>
                Half a minute inside: the feed, a post, a chat, a profile and dark mode. The people in it are made up.
              </figcaption>
              <button
                type="button"
                className="btn-ghost landing-video-btn"
                onClick={toggle}
                aria-label={playing ? 'Pause the demo' : 'Play the demo'}
              >
                {playing ? <Pause size={14} /> : <Play size={14} />}
                <span>{playing ? 'Pause' : 'Play'}</span>
              </button>
            </div>
          </figure>
        </section>

        <section className="landing-features" aria-labelledby="landing-what">
          <h2 id="landing-what">What is in it</h2>
          <dl className="landing-list">
            {FEATURES.map((f) => (
              <div key={f.title} className="landing-item">
                <dt>{f.title}</dt>
                <dd>{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="landing-close">
          <p className="landing-close-line">
            Your story<br />
            <em>starts here.</em>
          </p>
          <Link to="/register" className="landing-close-cta" onMouseEnter={warm} onFocus={warm}>Create an account</Link>
        </section>
      </main>

      <footer className="landing-foot">
        <span>The Chronicle</span>
        <span className="landing-foot-links">
          <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link>
        </span>
      </footer>
    </div>
  );
}
