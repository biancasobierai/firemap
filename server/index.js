import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseSecretKey) throw new Error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY em server/.env.');
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
let databaseReady = false;
const dataOrThrow = ({ data, error }) => {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
};

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

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@firemap.local').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
if (!process.env.ADMIN_PASSWORD) console.warn('[aviso] ADMIN_PASSWORD não definido: usando a senha de demonstração "admin123". Defina uma senha em server/.env.');
const usersRepo = {
  byEmail: async email => {
    const user = dataOrThrow(await supabase.from('app_users').select('id,name,email,password_hash').eq('email', email).maybeSingle());
    return user && { id: String(user.id), name: user.name, email: user.email, passwordHash: user.password_hash };
  },
  get: async id => {
    const user = dataOrThrow(await supabase.from('app_users').select('id,name,email,password_hash').eq('id', id).maybeSingle());
    return user && { id: String(user.id), name: user.name, email: user.email, passwordHash: user.password_hash };
  },
};
const publicUser = u => ({ id: u.id, name: u.name, email: u.email });

// Limite de tentativas de login por IP: 10 falhas / 15 min
const attempts = new Map();
const WINDOW = 15 * 60 * 1000, MAX_FAILS = 10;
const blocked = ip => { const a = attempts.get(ip); return !!a && a.reset > Date.now() && a.n >= MAX_FAILS; };
const failed = ip => { const a = attempts.get(ip); (!a || a.reset <= Date.now()) ? attempts.set(ip, { n: 1, reset: Date.now() + WINDOW }) : a.n++; };

const wrap = fn => (req, res) => fn(req, res).catch(err => res.status(500).json({ error: err.message }));

app.get('/api/health', (_req, res) => res.status(databaseReady ? 200 : 503).json({
  api: 'ok', database: databaseReady ? 'connected' : 'unavailable',
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  if (!databaseReady) return res.status(503).json({ error: 'Banco indisponível. Verifique a configuração do Supabase.' });
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
  if (!databaseReady) return res.status(503).json({ error: 'Banco indisponível. Verifique a configuração do Supabase.' });
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


const day = 86400000;
const iso = n => new Date(Date.now() + n * day).toISOString().slice(0, 10);

// Plantas de demonstração: croqui em SVG gerado aqui (no uso real, vem do upload do usuário)
const sketch = rooms => 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="1000" height="600"><rect width="100" height="60" fill="#fff"/>` +
  `<rect x=".5" y=".5" width="99" height="59" fill="none" stroke="#22262b" stroke-width="1"/>` +
  rooms.map(r => `<rect x="${r[0]}" y="${r[1]}" width="${r[2]}" height="${r[3]}" fill="#f3f4f6" stroke="#6b7280" stroke-width=".4"/>`).join('') + `</svg>`).toString('base64');
const defaultPlans = [
  { name: 'Térreo', image: sketch([[2, 2, 36, 56], [38, 2, 24, 56], [62, 2, 36, 28], [62, 30, 36, 28]]) },
  { name: '1º andar', image: sketch([[2, 2, 30, 56], [32, 2, 36, 30], [32, 32, 36, 26], [68, 2, 30, 56]]) },
];
const fromPlan = plan => ({ ...plan, id: String(plan.id) });
const plansRepo = {
  list: async () => dataOrThrow(await supabase.from('plans').select('*').order('id')).map(fromPlan),
  get: async id => {
    const plan = dataOrThrow(await supabase.from('plans').select('*').eq('id', id).maybeSingle());
    return plan && fromPlan(plan);
  },
  create: async plan => fromPlan(dataOrThrow(await supabase.from('plans').insert(plan).select('*').single())),
  update: async (id, plan) => {
    const updated = dataOrThrow(await supabase.from('plans').update(plan).eq('id', id).select('*').maybeSingle());
    return updated && fromPlan(updated);
  },
  remove: async id => (dataOrThrow(await supabase.from('plans').delete().eq('id', id).select('id'))).length > 0,
};

const demoExtinguishers = [
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
  code: `EXT-${String(i + 1).padStart(3, '0')}`, type: r[0], location: r[1],
  planId: String(r[2] + 1), x: r[3], y: r[4], expiry: iso(r[5]), nextMaintenance: iso(r[6]), maintenancePending: r[7],
}));
const fromExtinguisher = item => ({
  id: String(item.id), code: item.code, type: item.type, location: item.location,
  planId: String(item.plan_id), x: Number(item.x), y: Number(item.y), expiry: item.expiry,
  nextMaintenance: item.next_maintenance, maintenancePending: item.maintenance_pending,
});
const toExtinguisher = item => {
  const row = {
    type: item.type, location: item.location, plan_id: Number(item.planId), x: item.x, y: item.y,
    expiry: item.expiry, next_maintenance: item.nextMaintenance, maintenance_pending: item.maintenancePending,
  };
  if (item.code) row.code = item.code;
  return row;
};
const repo = {
  list: async () => dataOrThrow(await supabase.from('extinguishers').select('*').order('id')).map(fromExtinguisher),
  get: async id => {
    const item = dataOrThrow(await supabase.from('extinguishers').select('*').eq('id', id).maybeSingle());
    return item && fromExtinguisher(item);
  },
  create: async item => fromExtinguisher(dataOrThrow(await supabase.from('extinguishers').insert(toExtinguisher(item)).select('*').single())),
  update: async (id, item) => {
    const updated = dataOrThrow(await supabase.from('extinguishers').update(toExtinguisher(item)).eq('id', id).select('*').maybeSingle());
    return updated && fromExtinguisher(updated);
  },
  remove: async id => (dataOrThrow(await supabase.from('extinguishers').delete().eq('id', id).select('id'))).length > 0,
};

const initializeDatabase = async () => {
  const plans = dataOrThrow(await supabase.from('plans').select('id').limit(1));
  if (!plans.length) {
    const insertedPlans = dataOrThrow(await supabase.from('plans').insert(defaultPlans).select('id,name'));
    const planIds = new Map(insertedPlans.map(plan => [plan.name, String(plan.id)]));
    const demoRows = demoExtinguishers.map(item => ({
      ...item,
      planId: planIds.get(item.planId === '1' ? 'Térreo' : '1º andar'),
    }));
    dataOrThrow(await supabase.from('extinguishers').insert(demoRows.map(toExtinguisher)));
  }

  const admin = await usersRepo.byEmail(ADMIN_EMAIL);
  if (!admin) {
    dataOrThrow(await supabase.from('app_users').insert({
      name: 'Administrador', email: ADMIN_EMAIL, password_hash: hashPw(ADMIN_PASSWORD),
    }));
  }
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
  const key = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL?.replace(/\/+$/, '');
  const model = process.env.AI_MODEL;
  if (!key || !baseUrl || !model) return res.status(503).json({ error: 'IA não configurada: defina AI_BASE_URL, AI_API_KEY e AI_MODEL em server/.env.' });
  const messages = (req.body.messages || []).slice(-20).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));
  if (!messages.length || messages[0].role !== 'user') return res.status(400).json({ error: 'Mensagem inválida.' });
  const base = (await all()).map(({ code, type, location, planName, expiry, daysToExpiry, status, nextMaintenance, maintenancePending, alerts }) =>
    ({ code, type, location, planta: planName, validade: expiry, diasParaVencer: daysToExpiry, status, proximaManutencao: nextMaintenance, manutencaoPendente: maintenancePending, alertas: alerts }));
  const system = `Você é o assistente do FireMap, sistema de gestão de extintores de incêndio. Hoje é ${iso(0)}.
Responda em português do Brasil, de forma clara e objetiva, usando SOMENTE os dados abaixo. Se faltar informação, diga isso. Cite sempre o código (EXT-000). "Próximo do vencimento" = vence em até ${WARN_DAYS} dias; "vencido" = validade anterior a hoje. Considere o histórico da conversa em perguntas de acompanhamento ("e no 1º andar?", "qual deles é mais urgente?"). Calcule prazos a partir de diasParaVencer.
DADOS (JSON):
${JSON.stringify(base)}`;
  const r = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 1000, messages: [{ role: 'system', content: system }, ...messages] }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const detail = j?.error?.message || j?.message || `${r.status} ${r.statusText}`;
    return res.status(502).json({ error: `Falha ao consultar a IA (${r.status}): ${detail}` });
  }
  const reply = j.choices?.[0]?.message?.content;
  if (typeof reply !== 'string' || !reply.trim()) return res.status(502).json({ error: 'A IA retornou uma resposta vazia.' });
  res.json({ reply });
}));

// Erros fora das rotas (ex.: corpo grande demais) sempre em JSON
app.use((err, _req, res, _next) => res.status(err.status || 500).json({ error: err.type === 'entity.too.large' ? 'Arquivo muito grande.' : err.message }));

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log('FireMap API em http://localhost:' + port);
  initializeDatabase().then(() => {
    databaseReady = true;
    console.log('[info] Supabase conectado.');
  }).catch(error => {
    console.error(`[aviso] Supabase indisponível: ${error.message}`);
  });
});
