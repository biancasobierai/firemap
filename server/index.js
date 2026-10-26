import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors(), express.json({ limit: '12mb' })); // 12mb: comporta a imagem da planta enviada em base64

// ---------- Autenticação (senha com scrypt + token HMAC-SHA256 com expiração) ----------
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) console.warn('[aviso] JWT_SECRET não definido: as sessões serão encerradas ao reiniciar o servidor.');
const TOKEN_TTL = 8 * 3600; // segundos

const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
const makeToken = u => {
  const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: u.id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL })}`;
  return `${head}.${sign(head)}`;
};
const readToken = t => {
  const [h, p, s] = String(t).split('.');
  if (!h || !p || !s) return null;
  const ok = Buffer.from(sign(`${h}.${p}`)), got = Buffer.from(s);
  if (ok.length !== got.length || !crypto.timingSafeEqual(ok, got)) return null;
  const body = JSON.parse(Buffer.from(p, 'base64url').toString());
  return body.exp > Date.now() / 1000 ? body : null;
};

const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
const checkPw = (pw, stored) => {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex'), b = crypto.scryptSync(pw, salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const NO_USER = hashPw('x'); // mantém o tempo de resposta igual quando o e-mail não existe

// Repositório de usuários (troque por banco real mantendo a interface)
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@firemap.local').trim().toLowerCase();
if (!process.env.ADMIN_PASSWORD) console.warn('[aviso] ADMIN_PASSWORD não definido: usando a senha de demonstração "admin123". Defina uma senha em server/.env.');
const users = [{ id: '1', name: 'Administrador', email: ADMIN_EMAIL, passwordHash: hashPw(process.env.ADMIN_PASSWORD || 'admin123') }];
const usersRepo = {
  byEmail: async email => users.find(u => u.email === email),
  get: async id => users.find(u => u.id === id),
};
const publicUser = u => ({ id: u.id, name: u.name, email: u.email });

// Limite de tentativas de login por IP: 10 falhas / 15 min
const attempts = new Map();
const WINDOW = 15 * 60 * 1000, MAX_FAILS = 10;
const blocked = ip => { const a = attempts.get(ip); return !!a && a.reset > Date.now() && a.n >= MAX_FAILS; };
const failed = ip => { const a = attempts.get(ip); (!a || a.reset <= Date.now()) ? attempts.set(ip, { n: 1, reset: Date.now() + WINDOW }) : a.n++; };

const wrap = fn => (req, res) => fn(req, res).catch(err => res.status(500).json({ error: err.message }));

app.post('/api/auth/login', wrap(async (req, res) => {
  if (blocked(req.ip)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' });
  const email = String(req.body.email || '').trim().toLowerCase(), password = String(req.body.password || '');
  const u = await usersRepo.byEmail(email);
  const ok = checkPw(password, u ? u.passwordHash : NO_USER) && !!u;
  if (!ok) { failed(req.ip); return res.status(401).json({ error: 'E-mail ou senha incorretos.' }); }
  attempts.delete(req.ip);
  res.json({ token: makeToken(u), user: publicUser(u) });
}));

// Tudo em /api abaixo desta linha exige login
app.use('/api', (req, res, next) => {
  (async () => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    let claims = null;
    try { claims = m && readToken(m[1]); } catch { /* token malformado */ }
    const user = claims && await usersRepo.get(claims.sub);
    if (!user) return res.status(401).json({ error: 'Sessão expirada. Faça login novamente.' });
    req.user = user; next();
  })().catch(next);
});
app.get('/api/auth/me', (req, res) => res.json(publicUser(req.user)));

// ---------- Repositórios (troque por banco real mantendo a interface) ----------
const day = 86400000;
const iso = n => new Date(Date.now() + n * day).toISOString().slice(0, 10);

// Plantas de demonstração: croqui em SVG gerado aqui (no uso real, vem do upload do usuário)
const sketch = rooms => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="1000" height="600"><rect width="100" height="60" fill="#fff"/>` +
  `<rect x=".5" y=".5" width="99" height="59" fill="none" stroke="#22262b" stroke-width="1"/>` +
  rooms.map(r => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="#f3f4f6" stroke="#6b7280" stroke-width=".4"/>`).join('') + `</svg>`).toString('base64');
let pseq = 2;
let plans = [
  { id: '1', name: 'Térreo', image: sketch([[2, 2, 36, 56], [38, 2, 24, 56], [62, 2, 36, 28], [62, 30, 36, 28]]) },
  { id: '2', name: '1º andar', image: sketch([[2, 2, 30, 56], [32, 2, 36, 30], [32, 32, 36, 26], [68, 2, 30, 56]]) },
];
const plansRepo = {
  list: async () => plans,
  get: async id => plans.find(p => p.id === id),
  create: async p => { const n = { ...p, id: String(++pseq) }; plans.push(n); return n; },
  update: async (id, p) => { const i = plans.findIndex(x => x.id === id); if (i < 0) return null; plans[i] = { ...plans[i], ...p, id }; return plans[i]; },
  remove: async id => { const n = plans.length; plans = plans.filter(p => p.id !== id); return plans.length < n; },
};

let seq = 12;
let data = [
  ['PQS 6kg', 'Recepção', 0, 12, 50, 200, 20, false],
  ['CO2 6kg', 'Sala de servidores', 0, 30, 20, 45, -10, true],
  ['ABC 4kg', 'Corredor principal', 0, 50, 50, 20, 100, false],
  ['Água 10L', 'Almoxarifado', 0, 82, 25, -15, -90, true],
  ['PQS 12kg', 'Garagem', 0, 85, 78, 300, 40, false],
  ['ABC 6kg', 'Cozinha', 0, 15, 80, 55, 5, false],
  ['CO2 4kg', 'Sala de reunião 1', 1, 20, 25, 90, 60, false],
  ['PQS 6kg', 'Escritório administrativo', 1, 45, 30, 8, 25, true],
  ['ABC 6kg', 'Corredor 1º andar', 1, 50, 70, 240, 80, false],
  ['Água 10L', 'Arquivo', 1, 80, 25, -40, -60, false],
  ['CO2 6kg', 'Laboratório', 1, 82, 75, 70, 15, false],
].map((r, i) => ({
  id: String(i + 1), code: `EXT-${String(i + 1).padStart(3, '0')}`, type: r[0], location: r[1],
  planId: String(r[2] + 1), x: r[3], y: r[4], expiry: iso(r[5]), nextMaintenance: iso(r[6]), maintenancePending: r[7],
}));
const repo = {
  list: async () => data,
  get: async id => data.find(e => e.id === id),
  create: async e => { const n = { ...e, id: String(++seq) }; n.code ||= `EXT-${String(seq).padStart(3, '0')}`; data.push(n); return n; },
  update: async (id, e) => { const i = data.findIndex(x => x.id === id); if (i < 0) return null; data[i] = { ...data[i], ...e, id }; return data[i]; },
  remove: async id => { const n = data.length; data = data.filter(e => e.id !== id); return data.length < n; },
};

// ---------- Regras de negócio ----------
const WARN_DAYS = 60;
const daysTo = d => Math.ceil((new Date(d) - new Date(iso(0))) / day);
const enrich = (e, planName = '—') => {
  const d = daysTo(e.expiry);
  const status = d < 0 ? 'vencido' : d <= WARN_DAYS ? 'proximo' : 'regular';
  const mDays = daysTo(e.nextMaintenance);
  const alerts = [];
  if (status === 'vencido') alerts.push(`Vencido há ${-d} dias`);
  if (status === 'proximo') alerts.push(`Vence em ${d} dias`);
  if (e.maintenancePending) alerts.push('Manutenção pendente');
  return { ...e, planName, status, daysToExpiry: d, daysToMaintenance: mDays, alerts };
};
const all = async () => {
  const names = new Map((await plansRepo.list()).map(p => [p.id, p.name]));
  return (await repo.list()).map(e => enrich(e, names.get(e.planId)));
};
const one = async e => enrich(e, (await plansRepo.get(e.planId))?.name);

// ---------- API REST: extintores ----------
const pct = (v, d = 50) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n * 10) / 10)) : d; };
const clean = b => ({
  code: b.code?.trim(), type: b.type?.trim(), location: b.location?.trim(), planId: String(b.planId ?? ''),
  x: pct(b.x), y: pct(b.y), expiry: b.expiry, nextMaintenance: b.nextMaintenance, maintenancePending: !!b.maintenancePending,
});
const invalid = async b => {
  if (!b.type || !b.location || !b.expiry) return 'Informe tipo, localização e validade.';
  if (!(await plansRepo.get(b.planId))) return 'Selecione uma planta válida.';
};

app.get('/api/extinguishers', wrap(async (_, res) => res.json(await all())));
app.get('/api/extinguishers/:id', wrap(async (req, res) => {
  const e = await repo.get(req.params.id); e ? res.json(await one(e)) : res.status(404).json({ error: 'Não encontrado' });
}));
app.post('/api/extinguishers', wrap(async (req, res) => {
  const b = clean(req.body), err = await invalid(b);
  if (err) return res.status(400).json({ error: err });
  res.status(201).json(await one(await repo.create(b)));
}));
app.put('/api/extinguishers/:id', wrap(async (req, res) => {
  const b = clean(req.body), err = await invalid(b);
  if (err) return res.status(400).json({ error: err });
  const e = await repo.update(req.params.id, b); e ? res.json(await one(e)) : res.status(404).json({ error: 'Não encontrado' });
}));
app.delete('/api/extinguishers/:id', wrap(async (req, res) => res.status(await repo.remove(req.params.id) ? 204 : 404).end()));

// ---------- API REST: plantas ----------
const MAX_IMAGE = 8_000_000; // caracteres base64 (~6 MB)
const validImage = s => typeof s === 'string' && s.length <= MAX_IMAGE && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s);
const IMAGE_ERR = 'Envie a imagem da planta em PNG, JPG, WEBP ou SVG (até 6 MB).';

app.get('/api/plans', wrap(async (_, res) => res.json(await plansRepo.list())));
app.post('/api/plans', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe o nome da planta.' });
  if (!validImage(req.body.image)) return res.status(400).json({ error: IMAGE_ERR });
  res.status(201).json(await plansRepo.create({ name, image: req.body.image }));
}));
app.put('/api/plans/:id', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Informe o nome da planta.' });
  const patch = { name };
  if (req.body.image) { if (!validImage(req.body.image)) return res.status(400).json({ error: IMAGE_ERR }); patch.image = req.body.image; }
  const p = await plansRepo.update(req.params.id, patch); p ? res.json(p) : res.status(404).json({ error: 'Não encontrado' });
}));
app.delete('/api/plans/:id', wrap(async (req, res) => {
  if ((await repo.list()).some(e => e.planId === req.params.id))
    return res.status(409).json({ error: 'Esta planta tem extintores. Mova ou exclua os extintores antes de remover a planta.' });
  res.status(await plansRepo.remove(req.params.id) ? 204 : 404).end();
}));

app.get('/api/dashboard', wrap(async (_, res) => {
  const l = await all();
  res.json({
    total: l.length,
    regular: l.filter(e => e.status === 'regular').length,
    proximos: l.filter(e => e.status === 'proximo').length,
    vencidos: l.filter(e => e.status === 'vencido').length,
    manutencao: l.filter(e => e.maintenancePending).length,
  });
}));
app.get('/api/alerts', wrap(async (_, res) => res.json((await all()).filter(e => e.alerts.length).sort((a, b) => a.daysToExpiry - b.daysToExpiry))));

// ---------- Chat com IA (contexto = dados reais a cada pergunta) ----------
app.post('/api/chat', wrap(async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(503).json({ error: 'IA não configurada: defina ANTHROPIC_API_KEY em server/.env.' });
  const messages = (req.body.messages || []).slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
  if (!messages.length || messages[0].role !== 'user') return res.status(400).json({ error: 'Mensagem inválida.' });
  const base = (await all()).map(({ code, type, location, planName, expiry, daysToExpiry, status, nextMaintenance, maintenancePending, alerts }) =>
    ({ code, type, location, planta: planName, validade: expiry, diasParaVencer: daysToExpiry, status, proximaManutencao: nextMaintenance, manutencaoPendente: maintenancePending, alertas: alerts }));
  const system = `Você é o assistente do FireMap, sistema de gestão de extintores de incêndio. Hoje é ${iso(0)}.
Responda em português do Brasil, de forma clara e objetiva, usando SOMENTE os dados abaixo. Se faltar informação, diga isso. Cite sempre o código (EXT-000). "Próximo do vencimento" = vence em até ${WARN_DAYS} dias; "vencido" = validade anterior a hoje. Considere o histórico da conversa em perguntas de acompanhamento ("e no 1º andar?", "qual deles é mais urgente?"). Calcule prazos a partir de diasParaVencer.
DADOS (JSON):
${JSON.stringify(base)}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6', max_tokens: 1000, system, messages }),
  });
  const j = await r.json();
  if (!r.ok) return res.status(502).json({ error: j.error?.message || 'Falha ao consultar a IA.' });
  res.json({ reply: j.content.filter(c => c.type === 'text').map(c => c.text).join('\n') });
}));

// Erros fora das rotas (ex.: corpo grande demais) sempre em JSON
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'Arquivo muito grande.' : err.message }));

app.listen(process.env.PORT || 3001, () => console.log('FireMap API em http://localhost:' + (process.env.PORT || 3001)));
