import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { Badge, StatCard, Page, Modal, Details, Err, ExtForm, blankExt, useAsync, fmt } from './components';

const AlertList = ({ items }) => items.length === 0 ? <p className="empty">Nenhum alerta ativo. Todos os equipamentos estão em dia.</p> : (
  <ul className="alerts">{items.map(e => (
    <li key={e.id} className={e.status}>
      <div><strong>{e.code}</strong> · {e.type}<br /><small>{e.location}</small></div>
      <div className="tags">{e.alerts.map(a => <Badge key={a} status={a.startsWith('Manut') ? 'proximo' : e.status}>{a}</Badge>)}</div>
    </li>))}</ul>
);

export function Dashboard() {
  const [d, err] = useAsync(api.dashboard); const [al] = useAsync(api.alerts);
  return (
    <Page title="Painel">
      <Err msg={err} />
      <div className="stats">
        <StatCard label="Total de extintores" value={d?.total} />
        <StatCard label="Regulares" value={d?.regular} tone="ok" />
        <StatCard label="Próximos do vencimento" value={d?.proximos} tone="warn" />
        <StatCard label="Vencidos" value={d?.vencidos} tone="bad" />
        <StatCard label="Manutenções pendentes" value={d?.manutencao} tone="warn" />
      </div>
      <h2>Requer atenção</h2>
      <AlertList items={(al || []).slice(0, 5)} />
    </Page>
  );
}

export function Registry() {
  const [list, err, reload] = useAsync(api.list); const [plans] = useAsync(api.plans);
  const [q, setQ] = useState(''); const [form, setForm] = useState(null); const [view, setView] = useState(null); const [msg, setMsg] = useState('');
  const shown = (list || []).filter(e => [e.code, e.type, e.location, e.planName].join(' ').toLowerCase().includes(q.toLowerCase()));
  const del = async e => {
    if (!confirm(`Excluir ${e.code}?`)) return;
    try { await api.remove(e.id); reload(); } catch (x) { setMsg(x.message); }
  };
  return (
    <Page title="Extintores" actions={<button className="btn" disabled={!plans?.length} title={plans && !plans.length ? 'Cadastre uma planta primeiro' : ''} onClick={() => setForm(blankExt(plans[0].id))}>Novo extintor</button>}>
      <Err msg={err || msg} />
      {plans && !plans.length && <p className="empty">Cadastre uma planta na aba Planta para poder adicionar extintores.</p>}
      <input className="search" placeholder="Pesquisar por código, tipo, local ou planta" value={q} onChange={e => setQ(e.target.value)} />
      <div className="table-wrap"><table>
        <thead><tr><th>Código</th><th>Tipo</th><th>Local</th><th>Planta</th><th>Validade</th><th>Situação</th><th></th></tr></thead>
        <tbody>{shown.map(e => (
          <tr key={e.id}><td><b>{e.code}</b></td><td>{e.type}</td><td>{e.location}</td><td>{e.planName}</td><td>{fmt(e.expiry)}</td><td><Badge status={e.status} /></td>
            <td className="row-actions"><button className="link" onClick={() => setView(e)}>Consultar</button><button className="link" onClick={() => setForm(e)}>Editar</button><button className="link danger" onClick={() => del(e)}>Excluir</button></td></tr>))}
          {list && !shown.length && <tr><td colSpan="7" className="empty">Nenhum extintor encontrado.</td></tr>}</tbody>
      </table></div>
      {view && <Modal title={view.code} onClose={() => setView(null)}><Details e={view} /></Modal>}
      {form && <ExtForm initial={form} plans={plans} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}
    </Page>
  );
}

export function Alerts() {
  const [al, err] = useAsync(api.alerts);
  return <Page title="Alertas"><Err msg={err} />{al && <AlertList items={al} />}</Page>;
}

const TIPS = ['Quais extintores precisam de atenção?', 'Quais vencem nos próximos 60 dias?', 'Onde está localizado o extintor EXT-003?', 'Quais manutenções estão pendentes?'];
export function Chat() {
  const [msgs, setMsgs] = useState([]); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const end = useRef();
  useEffect(() => end.current?.scrollIntoView({ behavior: 'smooth' }), [msgs, busy]);
  const send = async t => {
    t = t.trim(); if (!t || busy) return;
    const next = [...msgs, { role: 'user', content: t }]; setMsgs(next); setText(''); setBusy(true);
    try { const { reply } = await api.chat(next); setMsgs([...next, { role: 'assistant', content: reply }]); }
    catch (e) { setMsgs([...next, { role: 'assistant', content: e.message, error: true }]); }
    setBusy(false);
  };
  return (
    <Page title="Assistente IA">
      <div className="chat">
        <div className="chat-log">
          {!msgs.length && <div className="empty"><p>Pergunte sobre validade, localização e manutenção dos extintores cadastrados.</p><div className="chips">{TIPS.map(t => <button key={t} onClick={() => send(t)}>{t}</button>)}</div></div>}
          {msgs.map((m, i) => <div key={i} className={`bubble ${m.role} ${m.error ? 'err' : ''}`}>{m.content}</div>)}
          {busy && <div className="bubble assistant typing">Consultando os dados…</div>}
          <div ref={end} />
        </div>
        <form className="chat-input" onSubmit={e => { e.preventDefault(); send(text); }}>
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Digite sua pergunta" aria-label="Pergunta" />
          <button className="btn" disabled={busy}>Enviar</button>
        </form>
      </div>
    </Page>
  );
}
