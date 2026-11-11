// Records the demo shown on the front page (public/demo*.mp4, .webm, -poster.jpg).
//
// It signs up five throwaway accounts on the REAL database in .env, gives them
// made-up posts, photos drawn in the browser, comments and chats, films a
// scripted tour, and deletes all of it again. No real user appears: the feed,
// the suggestions and the weekly list are filtered to the demo accounts, and
// the list of who is online is hidden. Needs Confirm email OFF in Supabase.
//
// 1. npm run build, then: npx vite preview --host 127.0.0.1 --port 4174 --strictPort
// 2. node scripts/record-demo.mjs out/wide          (desktop, 1280x720)
//    MODE=phone node scripts/record-demo.mjs out/phone   (phone, 390x844)
//    Each writes frames/ and list.txt (frame timings) into the folder.
// 3. Encode with ffmpeg, from inside that folder. The range conversion matters:
//    without it Chrome refuses to decode the result.
//    VF="setpts=PTS/1.3,fps=30,scale=in_range=full:out_range=tv,format=yuv420p"
//    ffmpeg -f concat -safe 0 -i list.txt -vf "$VF" -c:v libx264 -profile:v high -preset slow -crf 24 -movflags +faststart -an demo.mp4
//    ffmpeg -f concat -safe 0 -i list.txt -vf "$VF" -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 -an demo.webm
//    ffmpeg -i frames/f00000.jpg -q:v 3 demo-poster.jpg
//    (phone: the names are demo-phone.*, with -crf 21 and -crf 32)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..').split(path.sep).join('/');
const BASE = process.env.BASE || 'http://127.0.0.1:4174';
const OUT = process.argv[2];
if (!OUT) { console.log('usage: node scripts/record-demo.mjs <output folder>'); process.exit(1); }
const PHONE = process.env.MODE === 'phone';
const W = PHONE ? 390 : 1280, H = PHONE ? 844 : 720, DSF = PHONE ? 2 : 1;
const require = createRequire(FRONTEND + '/package.json');
const { createClient } = require('@supabase/supabase-js');
const { chromium } = require('@playwright/test');
const env = Object.fromEntries(fs.readFileSync(FRONTEND + '/.env', 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const mk = () => createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };

async function signup(handle, display, bio) {
  const client = mk();
  const tag = crypto.randomBytes(2).toString('hex');
  const u = { client, username: handle, email: `demo.${handle}.${tag}@example.com`, password: 'Dm-' + crypto.randomBytes(9).toString('hex') };
  let { data, error } = await client.auth.signUp({ email: u.email, password: u.password, options: { data: { username: u.username } } });
  if (error && /username|already|taken|database/i.test(error.message)) {
    u.username = `${handle}_${tag}`;
    ({ data, error } = await client.auth.signUp({ email: u.email, password: u.password, options: { data: { username: u.username } } }));
  }
  if (error || !data.session) throw new Error('signup ' + (error ? error.message : 'no session'));
  u.id = data.user.id;
  await client.from('profiles').update({ display_name: display, bio }).eq('id', u.id);
  return u;
}

// Pictures drawn in the browser: layered landscapes and soft avatar discs
const ART = `(() => {
  const png = (c) => c.toDataURL('image/png').split(',')[1];
  window.landscape = (w, h, sky, sun, hills, seed) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h); sky.forEach((col, i) => g.addColorStop(i / (sky.length - 1), col)); x.fillStyle = g; x.fillRect(0, 0, w, h);
    const sx = w * sun[0], sy = h * sun[1], sr = h * sun[2];
    const glow = x.createRadialGradient(sx, sy, 0, sx, sy, sr * 5); glow.addColorStop(0, sun[3]); glow.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = glow; x.fillRect(0, 0, w, h);
    x.fillStyle = sun[4]; x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill();
    let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    hills.forEach((col, i) => {
      const base = h * (0.52 + i * 0.12), amp = h * (0.10 - i * 0.012), f1 = 1.2 + rnd() * 1.5, f2 = 2.5 + rnd() * 3, p1 = rnd() * 6, p2 = rnd() * 6;
      x.fillStyle = col; x.beginPath(); x.moveTo(0, h);
      for (let px = 0; px <= w; px += 4) { const t = px / w; x.lineTo(px, base - Math.sin(t * Math.PI * f1 + p1) * amp - Math.sin(t * Math.PI * f2 + p2) * amp * 0.35); }
      x.lineTo(w, h); x.closePath(); x.fill();
    });
    return png(c);
  };
  window.avatar = (a, b, letter) => {
    const c = document.createElement('canvas'); c.width = 240; c.height = 240; const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 240, 240); g.addColorStop(0, a); g.addColorStop(1, b); x.fillStyle = g; x.fillRect(0, 0, 240, 240);
    x.fillStyle = 'rgba(255,255,255,0.92)'; x.font = '600 112px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(letter, 120, 128);
    return png(c);
  };
})()`;

const users = [];
let browser;
let shotPage = null;
try {
  const settings = await (await fetch(env.VITE_SUPABASE_URL + '/auth/v1/settings', { headers: { apikey: env.VITE_SUPABASE_ANON_KEY } })).json();
  if (!settings.mailer_autoconfirm) throw new Error('email confirmation is on');
  browser = await chromium.launch({ channel: 'chrome' });

  // ---------- pictures
  const artPage = await browser.newPage();
  await artPage.evaluate(ART);
  const land = async (...a) => Buffer.from(await artPage.evaluate((args) => window.landscape(...args), a), 'base64');
  const av = async (...a) => Buffer.from(await artPage.evaluate((args) => window.avatar(...args), a), 'base64');
  const pics = {
    sunrise: await land(1200, 800, ['#f6c98a', '#f2a66b', '#e98a6a'], [0.68, 0.46, 0.07, 'rgba(255,236,190,0.55)', '#fff3d6'], ['#c9785c', '#9c5a4c', '#6e4340', '#45302f'], 7),
    lake1: await land(1200, 800, ['#2f4a63', '#6d8fa6', '#e8c9a8'], [0.3, 0.5, 0.05, 'rgba(255,225,190,0.5)', '#ffe9cf'], ['#5d7f8f', '#3f6272', '#2b4654', '#1c2f3a'], 21),
    lake2: await land(800, 800, ['#7aa7b8', '#bcd6cf', '#f1e3c4'], [0.75, 0.3, 0.06, 'rgba(255,255,230,0.5)', '#fffbe6'], ['#7fa58c', '#5b8571', '#3e6453', '#2a4539'], 34),
    lake3: await land(800, 800, ['#3a2e4f', '#8a5a78', '#f0a67c'], [0.5, 0.55, 0.08, 'rgba(255,200,160,0.55)', '#ffd9b3'], ['#7a4b63', '#59364c', '#3d2536', '#271824'], 52),
  };
  const faces = { mara: await av('#b6442b', '#d4a853', 'M'), jonas: await av('#3f6272', '#7fa58c', 'J'), bea: await av('#8a5a78', '#f0a67c', 'B'), tomas: await av('#45302f', '#c9785c', 'T'), lia: await av('#5b8571', '#f1e3c4', 'L') };
  await artPage.close();

  // ---------- people and posts
  const A = await signup('mara', 'Mara Villanueva', 'Film cameras, long walks and small things worth writing down.'); users.push(A);
  const B = await signup('jonas', 'Jonas Reyes', 'Third-year CS. Up before sunrise more often than I would like.'); users.push(B);
  const C = await signup('bea', 'Bea Santos', 'Coffee first.'); users.push(C);
  const D = await signup('tomas', 'Tomas Aquino', 'Weekend hiker.'); users.push(D);
  const E = await signup('lia', 'Lia Navarro', 'Sketchbooks and street food.'); users.push(E);
  for (const [u, key] of [[A, 'mara'], [B, 'jonas'], [C, 'bea'], [D, 'tomas'], [E, 'lia']]) {
    const p = `${u.id}/avatar.png`;
    must(await u.client.storage.from('avatars').upload(p, faces[key], { contentType: 'image/png', upsert: true }));
    await u.client.from('profiles').update({ avatar_url: u.client.storage.from('avatars').getPublicUrl(p).data.publicUrl }).eq('id', u.id);
  }
  const post = async (u, content, photos = []) => {
    const p = must(await u.client.from('posts').insert({ user_id: u.id, content, visibility: 'public' }).select().single());
    const rows = [];
    for (let i = 0; i < photos.length; i++) {
      const fp = `${u.id}/${p.id}/${crypto.randomUUID()}.png`;
      must(await u.client.storage.from('post-images').upload(fp, photos[i], { contentType: 'image/png' }));
      rows.push({ post_id: p.id, image_url: u.client.storage.from('post-images').getPublicUrl(fp).data.publicUrl, position: i });
    }
    if (rows.length) must(await u.client.from('post_images').insert(rows));
    return p;
  };
  const pLake = await post(A, `Three frames from the weekend at the lake. The light kept changing, so I kept shooting. @${B.username} you were right about the 50mm.`, [pics.lake1, pics.lake2, pics.lake3]);
  await sleep(1100);
  const pBea = await post(C, 'Does anyone have notes from the Thursday lecture? I will trade them for coffee.');
  await sleep(1100);
  const pSun = await post(B, 'Sunrise from the ridge trail this morning. Left at five, worth every step.', [pics.sunrise]);
  for (const [f, t] of [[A, B], [A, C], [B, A], [C, A], [B, C], [D, A], [E, B], [D, B]]) must(await f.client.from('follows').insert({ follower_id: f.id, following_id: t.id }));
  for (const [u, p] of [[B, pLake], [C, pLake], [D, pLake], [C, pSun], [D, pSun], [E, pSun], [B, pBea]]) must(await u.client.from('likes').insert({ user_id: u.id, post_id: p.id }));
  must(await C.client.from('comments').insert({ user_id: C.id, post_id: pSun.id, content: 'This is unreal. Adding the ridge to my Saturday plan.' }));
  must(await D.client.from('comments').insert({ user_id: D.id, post_id: pSun.id, content: 'Which trailhead did you start from?' }));
  const c1 = must(await B.client.from('comments').insert({ user_id: B.id, post_id: pLake.id, content: 'The second one is my favourite. What film was this?' }).select().single());
  must(await A.client.from('comments').insert({ user_id: A.id, post_id: pLake.id, parent_id: c1.id, content: 'Portra 400, pushed one stop.' }));

  const dm = must(await A.client.rpc('create_conversation', { member_ids: [B.id] }));
  const say = async (u, conv, content) => must(await u.client.from('messages').insert({ conversation_id: conv, sender_id: u.id, content }).select().single());
  await say(B, dm, 'Are you still coming to the photo walk on Saturday?');
  await say(A, dm, 'Yes! Bringing the old Pentax.');
  const grp = must(await C.client.rpc('create_conversation', { member_ids: [A.id, B.id], group_name: 'Saturday photo walk' }));
  await say(C, grp, 'Made a group so we stop losing the plan in three chats');
  await sleep(1100);
  const mLast = await say(B, dm, 'Perfect. Meet at the gate at six?');
  await A.client.rpc('mark_conversation_read', { conv_id: grp });
  const demoIds = new Set(users.map((u) => u.id));

  // ---------- the browser that is filmed
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, colorScheme: 'light', ...(PHONE ? { isMobile: true, hasTouch: true } : {}) });
  const page = await ctx.newPage();
  shotPage = page;
  const onlyDemo = (key) => async (route) => {
    const res = await route.fetch();
    let body = await res.json().catch(() => null);
    if (Array.isArray(body)) body = body.filter((row) => demoIds.has(row[key]));
    await route.fulfill({ response: res, json: body });
  };
  await page.route('**/rest/v1/rpc/fetch_posts', onlyDemo('user_id'));
  await page.route('**/rest/v1/rpc/suggested_follows', onlyDemo('id'));
  await page.route('**/rest/v1/rpc/active_posters', onlyDemo('id'));

  await page.goto(BASE + '/login');
  await page.getByLabel('Email').fill(A.email);
  await page.getByLabel('Password', { exact: true }).fill(A.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL('**/feed', { timeout: 20000 });
  await page.locator('.post-card img[src*="/object/sign/"]').first().waitFor({ timeout: 20000 });
  // A pointer that glides, and no list of who is really online right now
  await page.addStyleTag({ content: `
    .widget:has(.online-list) { display: none !important; }
    #demo-cursor { position: fixed; left: 0; top: 0; z-index: 99999; pointer-events: none; width: 22px; height: 22px;
      transform: translate(640px, 420px); transition: transform 0.58s cubic-bezier(0.22, 1, 0.36, 1); }
    #demo-cursor svg { display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.35)); transition: transform 0.12s ease; transform-origin: 4px 3px; }
    #demo-cursor.down svg { transform: scale(0.82); }
    html { scroll-behavior: smooth; }
    .toaster { display: none !important; }
  ` });
  await page.evaluate(() => {
    const c = document.createElement('div'); c.id = 'demo-cursor';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M4 3l13 6.2-5.4 1.9L9.7 17z" fill="#1a1410" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  });
  if (PHONE) {
    // a fingertip instead of an arrow
    await page.addStyleTag({ content: `
      #demo-cursor { width: 30px; height: 30px; margin: -11px 0 0 -11px; transform: translate(195px, 520px); }
      #demo-cursor svg { display: none; }
      #demo-cursor::before { content: ''; display: block; width: 30px; height: 30px; border-radius: 50%; background: rgba(26,20,16,0.28); border: 2px solid rgba(255,255,255,0.85); box-shadow: 0 1px 4px rgba(0,0,0,0.3); transition: transform 0.12s ease; }
      #demo-cursor.down::before { transform: scale(0.78); background: rgba(26,20,16,0.45); }
    ` });
  }
  const nav = (name) => PHONE ? page.locator('.mobile-nav-tab', { hasText: name }) : page.locator('.navbar .nav-link', { hasText: name });
  const glide = async (locator, dx = 0, dy = 0) => {
    // Bring it into the comfortable middle of the screen first, smoothly
    let b = await locator.boundingBox();
    if (b.y < 90 || b.y + b.height > H - (PHONE ? 140 : 70)) {
      const delta = b.y + b.height / 2 - H * (PHONE ? 0.5 : 0.58);
      await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), delta);
      await sleep(Math.min(1300, 500 + Math.abs(delta) * 0.9));
      b = await locator.boundingBox();
    }
    const x = b.x + b.width / 2 + dx, y = b.y + b.height / 2 + dy;
    await page.evaluate(([x, y]) => { document.getElementById('demo-cursor').style.transform = `translate(${x - 4}px, ${y - 3}px)`; }, [x, y]);
    await page.mouse.move(x, y, { steps: 12 });
    await sleep(600);
    return [x, y];
  };
  const press = async (locator, dx = 0, dy = 0) => {
    const [x, y] = await glide(locator, dx, dy);
    await page.evaluate(() => document.getElementById('demo-cursor').classList.add('down'));
    await sleep(110);
    await page.mouse.click(x, y);
    await page.evaluate(() => document.getElementById('demo-cursor').classList.remove('down'));
    await sleep(140);
  };
  const scrollTo = async (top, ms) => { await page.evaluate((t) => window.scrollTo({ top: t, behavior: 'smooth' }), top); await sleep(ms); };
  const type = async (locator, text) => { await locator.pressSequentially(text, { delay: 30 }); };
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1200);

  // ---------- film
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => { frames.push({ data: f.data, t: f.metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DSF, maxHeight: H * DSF, everyNthFrame: 1 });
  const t0 = Date.now();
  const mark = (name) => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s ${name}`);

  const park = async (x, y) => {
    await page.evaluate(([x, y]) => { document.getElementById('demo-cursor').style.transform = `translate(${x}px, ${y}px)`; }, [x, y]);
    await page.mouse.move(x, y, { steps: 8 });
  };
  await sleep(1100); mark('feed');
  const first = page.locator('.post-card').first();
  await press(first.locator('.like-btn')); await sleep(450); mark('liked');
  await press(first.locator('.comment-btn'));
  await first.locator('.comment-thread').first().waitFor({ timeout: 8000 });
  await sleep(350);
  const commentBox = first.getByLabel('Add a comment');
  await press(commentBox);
  await type(commentBox, 'Save me a spot next time!');
  await sleep(200);
  await press(first.locator('.comment-form button[type=submit]'));
  await first.locator('.comment-thread', { hasText: 'Save me a spot' }).waitFor({ timeout: 8000 });
  await sleep(700); mark('commented');
  if (!PHONE) await park(1215, 380);
  const lake = page.locator('.post-card', { hasText: 'Three frames from the weekend' });
  const lakeTop = await lake.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
  await scrollTo(lakeTop - (PHONE ? 68 : 76), 1500); await sleep(1300); mark('photos');
  await scrollTo(0, 1100);

  await press(nav('Messages'));
  await page.waitForURL('**/messages**');
  await sleep(450);
  await press(page.locator('.conv-list').getByText('Jonas Reyes').first());
  await page.locator('.msg-bubble', { hasText: 'Meet at the gate at six?' }).waitFor({ timeout: 10000 });
  await sleep(450);
  const row = page.locator('.msg-row', { hasText: 'Meet at the gate at six?' }).last();
  if (!PHONE) await glide(row.locator('.msg-bubble'));
  await press(row.getByRole('button', { name: 'React to message' }));
  await press(page.getByRole('toolbar', { name: 'Add a reaction' }).getByRole('button').first());
  await sleep(450);
  const msg = page.getByLabel('Message', { exact: true });
  await press(msg);
  await type(msg, 'Six works. See you there!');
  await sleep(150);
  await page.keyboard.press('Enter');
  await page.locator('.msg-bubble', { hasText: 'Six works' }).waitFor({ timeout: 8000 });
  await sleep(1100); mark('chat');

  await press(nav('Profile'));
  await page.locator('.profile-stats').waitFor({ timeout: 10000 });
  await page.locator('.post-card').first().waitFor({ timeout: 10000 });
  await sleep(900);
  if (!PHONE) await park(1215, 330);
  await scrollTo(380, 1100); await sleep(800); mark('profile');
  await scrollTo(0, 800);

  await press(page.locator('.nav-theme-btn'));
  await sleep(1100); mark('dark');
  await press(nav('Feed'));
  await page.locator('.post-card').first().waitFor({ timeout: 10000 });
  await sleep(1500);
  await press(page.locator('.nav-theme-btn'));
  await sleep(1200); mark('light again');

  await cdp.send('Page.stopScreencast');
  const total = (Date.now() - t0) / 1000;

  // ---------- frames and their timing, for ffmpeg
  fs.mkdirSync(path.join(OUT, 'frames'), { recursive: true });
  let list = '';
  frames.forEach((f, i) => {
    const name = `f${String(i).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(OUT, 'frames', name), Buffer.from(f.data, 'base64'));
    const next = frames[i + 1];
    const dur = next ? Math.max(0.001, next.t - f.t) : 0.6;
    list += `file 'frames/${name}'\nduration ${dur.toFixed(4)}\n`;
  });
  list += `file 'frames/f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(path.join(OUT, 'list.txt'), list);
  console.log(`frames ${frames.length}, length ${total.toFixed(1)}s, about ${(frames.length / total).toFixed(0)} frames a second`);
  await ctx.close();
} catch (e) {
  console.log('ERROR ' + e.message.split('\n').slice(0, 4).join(' '));
  if (shotPage) await shotPage.screenshot({ path: path.join(OUT, 'error.png') }).catch(() => {});
} finally {
  if (browser) await browser.close();
  for (const u of users) {
    const bucket = u.client.storage.from('post-images');
    const { data: folders } = await bucket.list(u.id);
    for (const f of folders || []) {
      const { data: inner } = await bucket.list(`${u.id}/${f.name}`);
      if (inner?.length) await bucket.remove(inner.map((x) => `${u.id}/${f.name}/${x.name}`));
    }
    const { data: avs } = await u.client.storage.from('avatars').list(u.id);
    if (avs?.length) await u.client.storage.from('avatars').remove(avs.map((x) => `${u.id}/${x.name}`));
    const { error } = await u.client.rpc('delete_my_account');
    console.log('cleanup ' + u.username + ' ' + (error ? error.message : 'ok'));
  }
  process.exit(0);
}
