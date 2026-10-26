import { useEffect, useState } from 'react';
import { api } from './api';

export const STATUS = { regular: 'Regular', proximo: 'Próximo do vencimento', vencido: 'Vencido' };
export const fmt = d => new Date(d + 'T12:00').toLocaleDateString('pt-BR');

export const useAsync = (fn, deps = []) => {
  const [data, setData] = useState(null); const [error, setError] = useState('');
  const reload = () => fn().then(d => { setData(d); setError(''); }).catch(e => setError(e.message));
  useEffect(() => { reload(); }, deps);
  return [data, error, reload];
};
export const Err = ({ msg }) => msg ? <p className="error" role="alert">{msg}</p> : null;

export const Logo = () => (
  <div className="logo">
    <svg viewBox="0 0 32 32" width="30" height="30"><rect width="32" height="32" rx="7" fill="#d71920" /><circle cx="16" cy="16" r="9" fill="none" stroke="#fff" strokeWidth="2" /><circle cx="16" cy="16" r="3.5" fill="#fff" /></svg>
    <span>FireMap</span>
  </div>
);
export const Badge = ({ status, children }) => <span className={'badge ' + status}>{children || STATUS[status]}</span>;
export const StatCard = ({ label, value, tone }) => (
  <div className={'stat ' + (tone || '')}><strong>{value ?? '–'}</strong><span>{label}</span></div>
);
export const Page = ({ title, actions, children }) => (
  <section className="page"><header className="page-head"><h1>{title}</h1><div>{actions}</div></header>{children}</section>
);
export const Modal = ({ title, onClose, children }) => (
  <div className="overlay" onClick={onClose}>
    <div className="modal" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
      <header><h2>{title}</h2><button className="icon" onClick={onClose} aria-label="Fechar">×</button></header>{children}
    </div>
  </div>
);
export const Details = ({ e }) => (
  <dl className="details">
    <dt>Código</dt><dd>{e.code}</dd>
    <dt>Tipo</dt><dd>{e.type}</dd>
    <dt>Localização</dt><dd>{e.location} · {e.planName}</dd>
    <dt>Validade</dt><dd>{fmt(e.expiry)} <Badge status={e.status} /></dd>
    <dt>Próxima manutenção</dt><dd>{fmt(e.nextMaintenance)}{e.maintenancePending && <> <Badge status="vencido">Pendente</Badge></>}</dd>
  </dl>
);

// ---------- Formulário de extintor (usado no cadastro e na planta) ----------
export const blankExt = planId => ({ code: '', type: 'PQS 6kg', location: '', planId, x: 50, y: 50, expiry: '', nextMaintenance: '', maintenancePending: false });

const Field = ({ label, value, onChange, ...rest }) => (
  <label>{label}<input value={value} onChange={ev => onChange(ev.target.value)} {...rest} /></label>
);

export function ExtForm({ initial, plans, onClose, onSaved }) {
  const [form, setForm] = useState(initial); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async ev => {
    ev.preventDefault(); setBusy(true); setMsg('');
    try { onSaved(await api.save(form)); } catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (
    <Modal title={form.id ? `Editar ${form.code}` : 'Novo extintor'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <Field label="Código (opcional)" value={form.code} onChange={v => set('code', v)} />
        <Field label="Tipo" value={form.type} onChange={v => set('type', v)} required />
        <Field label="Localização" value={form.location} onChange={v => set('location', v)} placeholder="Ex.: Corredor, ao lado da escada" required />
        <label>Planta
          <select value={form.planId} onChange={e => set('planId', e.target.value)} required>
            {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="pair">
          <Field label="Posição X (%)" type="number" min="0" max="100" step="0.1" value={form.x} onChange={v => set('x', v)} />
          <Field label="Posição Y (%)" type="number" min="0" max="100" step="0.1" value={form.y} onChange={v => set('y', v)} />
        </div>
        <Field label="Validade" type="date" value={form.expiry} onChange={v => set('expiry', v)} required />
        <Field label="Próxima manutenção" type="date" value={form.nextMaintenance} onChange={v => set('nextMaintenance', v)} required />
        <label className="check"><input type="checkbox" checked={form.maintenancePending} onChange={e => set('maintenancePending', e.target.checked)} />Manutenção pendente</label>
        <Err msg={msg} /><button className="btn" disabled={busy || !plans.length}>{busy ? 'Salvando…' : 'Salvar extintor'}</button>
      </form>
    </Modal>
  );
}
