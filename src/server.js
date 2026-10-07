import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import morgan from 'morgan';
import { db, initDb } from './db.js';

initDb();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const app = express();
const port = Number(process.env.PORT || 3333);

// ---------- Configuração (via variáveis de ambiente) ----------
const SITE_URL = (process.env.SITE_URL || `http://localhost:${port}`).replace(/\/$/, '');
const ADSENSE_CLIENT = process.env.ADSENSE_CLIENT || ''; // ex: ca-pub-1234567890123456
const ADSENSE_SLOT = process.env.ADSENSE_SLOT || '';     // ID do bloco de anúncio

let ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  ADMIN_SECRET = crypto.randomBytes(16).toString('hex');
  console.warn(`ADMIN_SECRET não definido. Token temporário desta execução: ${ADMIN_SECRET}`);
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const safeEqual = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const ADMIN_COOKIE_VALUE = sha(ADMIN_SECRET).toString('hex');

// ---------- Middlewares ----------
app.use(helmet({ contentSecurityPolicy: false }));
// Não registra a query string no log (evita vazar o token)
morgan.token('safe-url', (req) => req.originalUrl.split('?')[0]);
app.use(morgan(':method :safe-url :status :response-time ms'));
app.use(express.json({ limit: '100kb' }));

// ---------- Admin (registrado ANTES do express.static) ----------
function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isAdmin(req) {
  const cookie = getCookie(req, 'radar_admin');
  if (cookie && safeEqual(cookie, ADMIN_COOKIE_VALUE)) return true;
  const header = req.headers['x-admin-token'];
  return Boolean(header && safeEqual(header, ADMIN_SECRET));
}

function verificarAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  return res.status(404).send('Página não encontrada');
}

// Acesse UMA vez: /admin?token=SEU_TOKEN  -> grava cookie e remove o token da URL
app.get(['/admin', '/admin.html'], (req, res) => {
  const token = req.query.token;
  if (token && safeEqual(token, ADMIN_SECRET)) {
    res.cookie('radar_admin', ADMIN_COOKIE_VALUE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8
    });
    return res.redirect('/admin');
  }
  if (!isAdmin(req)) return res.status(404).send('Página não encontrada');
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});
app.use('/api/admin', verificarAdmin);

// ---------- Arquivos estáticos ----------
app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));

// ---------- Helpers de SEO / SSR ----------
const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function adBlock() {
  if (!ADSENSE_CLIENT || !ADSENSE_SLOT) return '';
  return `<div class="wrap ad"><ins class="adsbygoogle" style="display:block"
    data-ad-client="${esc(ADSENSE_CLIENT)}" data-ad-slot="${esc(ADSENSE_SLOT)}"
    data-ad-format="auto" data-full-width-responsive="true"></ins>
    <script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></div>`;
}

function renderThemePage(topic, candidates, proposals) {
  const url = `${SITE_URL}/comparar/${topic.slug}`;
  const title = `${topic.name}: propostas de ${candidates.map((c) => c.short_name || c.name).join(' e ')} | Radar do Segundo Turno`;
  const description = `Compare lado a lado as propostas sobre ${topic.name} nos planos de governo do 2º turno de 2026, com link para a fonte oficial.`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'WebPage',
    name: title, description, url, inLanguage: 'pt-BR'
  }).replace(/</g, '\\u003c');

  const columns = candidates.map((c) => {
    const items = proposals.filter((p) => p.candidate_id === c.id).map((p) => `
      <div class="proposal">
        <h4>${esc(p.title)} ${p.verified ? '<span class="badge">verificada</span>' : ''}</h4>
        <p>${esc(p.summary)}</p>
        ${p.source_url ? `<p class="muted">Fonte: <a href="${esc(p.source_url)}" target="_blank" rel="noopener noreferrer">${esc(p.source_title || p.source_publisher || 'documento oficial')}</a></p>` : ''}
      </div>`).join('') || '<p class="muted">Nenhuma proposta cadastrada neste tema.</p>';
    return `<article class="proposal-card"><h3>${esc(c.name)}</h3>${items}</article>`;
  }).join('');

  const shareText = encodeURIComponent(`${topic.name}: veja as propostas dos dois candidatos lado a lado, com fonte oficial: ${url}`);

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${esc(url)}">
<meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${jsonLd}</script>
${ADSENSE_CLIENT ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(ADSENSE_CLIENT)}" crossorigin="anonymous"></script>` : ''}
<link rel="stylesheet" href="/styles.css"></head><body>
<header class="top"><div class="wrap nav"><a class="brand" href="/">RADAR<span>²</span></a>
<nav><a href="/#comparar">Temas</a><a href="/#metodologia">Metodologia</a></nav></div></header>
<main><section class="section"><div class="wrap">
<p class="eyebrow">COMPARAÇÃO · 2º TURNO 2026</p>
<h1 class="page-title">${esc(topic.name)}</h1>
<p class="muted">${esc(topic.description || '')}</p>
${adBlock()}
<div class="proposal-grid">${columns}</div>
<a class="cta share" href="https://api.whatsapp.com/send?text=${shareText}" target="_blank" rel="noopener noreferrer">Compartilhar no WhatsApp</a>
<div class="disclaimer">O Radar resume e organiza informações dos documentos oficiais. A existência de uma proposta no plano não garante sua execução. Consulte sempre a fonte original.</div>
</div></section></main>
<footer><div class="wrap"><span>Radar do Segundo Turno · 2026</span><a href="/">Todos os temas</a></div></footer>
</body></html>`;
}

// ---------- SEO ----------
app.get('/sitemap.xml', (_req, res) => {
  const topics = db.prepare('SELECT slug FROM topics ORDER BY sort_order').all();
  const urls = [`${SITE_URL}/`, ...topics.map((t) => `${SITE_URL}/comparar/${t.slug}`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n') + `\n</urlset>`;
  res.type('application/xml').send(xml);
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin\nSitemap: ${SITE_URL}/sitemap.xml\n`);
});

// Página por tema, renderizada no servidor (o WhatsApp e o Google leem as metatags direto)
app.get('/comparar/:slug', (req, res) => {
  const topic = db.prepare('SELECT * FROM topics WHERE slug = ?').get(req.params.slug);
  if (!topic) return res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
  const candidates = db.prepare('SELECT id, name, short_name FROM candidates ORDER BY id').all();
  const proposals = db.prepare(`SELECT p.*, s.title AS source_title, s.url AS source_url, s.publisher AS source_publisher
    FROM proposals p LEFT JOIN sources s ON s.id = p.source_id
    WHERE p.topic_id = ? ORDER BY p.candidate_id, p.id`).all(topic.id);
  res.send(renderThemePage(topic, candidates, proposals));
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------- API pública ----------
const candidateSelect = `SELECT id, name, slug, short_name, party, photo_url FROM candidates ORDER BY id`;
const topicSelect = `SELECT id, name, slug, description, sort_order FROM topics ORDER BY sort_order, name`;

app.get('/api/summary', (_req, res) => {
  const count = (sql) => db.prepare(sql).get().total;
  res.json({
    topics: count('SELECT COUNT(*) AS total FROM topics'),
    proposals: count('SELECT COUNT(*) AS total FROM proposals'),
    sources: count('SELECT COUNT(*) AS total FROM sources'),
    verified: count('SELECT COUNT(*) AS total FROM proposals WHERE verified = 1')
  });
});

app.get('/api/candidates', (_req, res) => res.json(db.prepare(candidateSelect).all()));
app.get('/api/topics', (_req, res) => res.json(db.prepare(topicSelect).all()));
app.get('/api/sources', (_req, res) => res.json(db.prepare('SELECT * FROM sources ORDER BY id DESC').all()));

app.get('/api/proposals', (req, res) => {
  const { topic, candidate } = req.query;
  const where = [];
  const params = {};
  if (topic) { where.push('t.slug = @topic'); params.topic = topic; }
  if (candidate) { where.push('c.id = @candidate'); params.candidate = Number(candidate); }
  const sql = `SELECT p.id, p.title, p.summary, p.status, p.verified,
      c.id AS candidate_id, c.name AS candidate_name, c.slug AS candidate_slug,
      t.id AS topic_id, t.name AS topic_name, t.slug AS topic_slug,
      s.title AS source_title, s.url AS source_url, s.publisher AS source_publisher, s.published_at AS source_published_at
    FROM proposals p
    JOIN candidates c ON c.id = p.candidate_id
    JOIN topics t ON t.id = p.topic_id
    LEFT JOIN sources s ON s.id = p.source_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY t.sort_order, c.id, p.id`;
  res.json(db.prepare(sql).all(params));
});

app.get('/api/compare', (req, res) => {
  const { topic } = req.query;
  if (!topic) return res.status(400).json({ error: 'Informe o tema.' });
  const topicRow = db.prepare('SELECT * FROM topics WHERE slug = ?').get(topic);
  if (!topicRow) return res.status(404).json({ error: 'Tema não encontrado.' });
  const candidates = db.prepare(candidateSelect).all();
  const proposals = db.prepare(`SELECT p.*, c.name AS candidate_name, c.slug AS candidate_slug,
      s.title AS source_title, s.url AS source_url, s.publisher AS source_publisher, s.published_at AS source_published_at
      FROM proposals p JOIN candidates c ON c.id=p.candidate_id
      LEFT JOIN sources s ON s.id=p.source_id
      WHERE p.topic_id=? ORDER BY c.id, p.id`).all(topicRow.id);
  res.json({ topic: topicRow, candidates, proposals });
});

// ---------- API admin (protegida por app.use('/api/admin') acima) ----------
function requireFields(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || String(body[f]).trim() === '') return `Campo obrigatório: ${f}`;
  }
  return null;
}

app.post('/api/admin/topics', (req, res) => {
  const error = requireFields(req.body, ['name', 'slug']);
  if (error) return res.status(400).json({ error });
  try {
    const info = db.prepare('INSERT INTO topics (name, slug, description, sort_order) VALUES (?, ?, ?, ?)')
      .run(req.body.name.trim(), req.body.slug.trim(), req.body.description || '', Number(req.body.sort_order || 0));
    res.status(201).json({ id: info.lastInsertRowid });
  } catch { res.status(400).json({ error: 'Não foi possível criar o tema. Verifique o slug.' }); }
});

app.post('/api/admin/sources', (req, res) => {
  const error = requireFields(req.body, ['title', 'url']);
  if (error) return res.status(400).json({ error });
  const info = db.prepare('INSERT INTO sources (title, url, publisher, published_at) VALUES (?, ?, ?, ?)')
    .run(req.body.title.trim(), req.body.url.trim(), req.body.publisher || '', req.body.published_at || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.post('/api/admin/proposals', (req, res) => {
  const error = requireFields(req.body, ['candidate_id', 'topic_id', 'title', 'summary', 'source_id']);
  if (error) return res.status(400).json({ error });
  const info = db.prepare(`INSERT INTO proposals
    (candidate_id, topic_id, title, summary, status, source_id, verified)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(Number(req.body.candidate_id), Number(req.body.topic_id), req.body.title.trim(), req.body.summary.trim(),
      req.body.status || 'proposta', Number(req.body.source_id), req.body.verified ? 1 : 0);
  res.status(201).json({ id: info.lastInsertRowid });
});

// ---------- 404 real (nada de devolver index.html com status 200) ----------
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Não encontrado.' });
  res.status(404).sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(port, () => console.log(`Radar do Segundo Turno: ${SITE_URL}`));
