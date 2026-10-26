import { useRef, useState } from 'react';
import { api } from './api';
import { prepareImage } from './image';
import { Page, Modal, Details, Err, ExtForm, blankExt, useAsync, STATUS } from './components';

const clamp = v => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;

function PlanForm({ plan, onClose, onSaved }) {
  const [name, setName] = useState(plan.name || ''); const [image, setImage] = useState(null);
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const pick = async ev => {
    const f = ev.target.files[0]; if (!f) return; setMsg('');
    try { setImage(await prepareImage(f)); } catch (e) { setMsg(e.message); setImage(null); ev.target.value = ''; }
  };
  const submit = async ev => {
    ev.preventDefault();
    if (!plan.id && !image) return setMsg('Selecione a imagem da planta.');
    setBusy(true); setMsg('');
    try { onSaved(await api.savePlan({ id: plan.id, name, image })); } catch (e) { setMsg(e.message); setBusy(false); }
  };
  const preview = image || plan.image;
  return (
    <Modal title={plan.id ? 'Editar planta' : 'Nova planta'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Nome da planta<input value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Térreo, Bloco B – 2º andar" required /></label>
        <label>Imagem da planta
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={pick} />
          <small>PNG, JPG, WEBP ou SVG. Imagens grandes são reduzidas automaticamente.
            {plan.id && ' Deixe em branco para manter a imagem atual; os extintores continuam nas mesmas posições (em %).'}</small>
        </label>
        {preview && <img className="plan-preview" src={preview} alt="Pré-visualização da planta" />}
        <Err msg={msg} /><button className="btn" disabled={busy}>{busy ? 'Salvando…' : 'Salvar planta'}</button>
      </form>
    </Modal>
  );
}

export function Plan() {
  const [plans, perr, reloadPlans] = useAsync(api.plans);
  const [list, lerr, reloadList] = useAsync(api.list);
  const [planId, setPlanId] = useState(null); const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false); const [extForm, setExtForm] = useState(null); const [planForm, setPlanForm] = useState(null);
  const [drag, setDrag] = useState(null); const [msg, setMsg] = useState('');
  const canvas = useRef(); const dragRef = useRef(null);

  const plan = plans?.find(p => p.id === planId) || plans?.[0];
  const items = (list || []).filter(e => e.planId === plan?.id);
  const cur = items.find(e => e.id === sel);
  const at = ev => { const r = canvas.current.getBoundingClientRect(); return { x: clamp(((ev.clientX - r.left) / r.width) * 100), y: clamp(((ev.clientY - r.top) / r.height) * 100) }; };

  const choose = id => { setPlanId(id); setSel(null); setAdding(false); setMsg(''); };
  const place = ev => {
    if (!adding) return setSel(null);
    setExtForm({ ...blankExt(plan.id), ...at(ev) }); setAdding(false);
  };
  const down = (e, ev) => {
    if (adding) return;
    ev.stopPropagation(); ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = { id: e.id, cx: ev.clientX, cy: ev.clientY, moved: false }; setSel(e.id);
  };
  const move = ev => {
    const d = dragRef.current; if (!d) return;
    if (!d.moved && Math.hypot(ev.clientX - d.cx, ev.clientY - d.cy) < 4) return;
    Object.assign(d, { moved: true }, at(ev)); setDrag({ id: d.id, x: d.x, y: d.y });
  };
  const up = async e => {
    const d = dragRef.current; dragRef.current = null;
    if (!d?.moved) return;
    try { await api.save({ ...e, x: d.x, y: d.y }); await reloadList(); } catch (err) { setMsg(err.message); }
    setDrag(null);
  };
  const delExt = async e => {
    if (!confirm(`Excluir ${e.code}?`)) return;
    try { await api.remove(e.id); setSel(null); reloadList(); } catch (err) { setMsg(err.message); }
  };
  const delPlan = async () => {
    if (!confirm(`Excluir a planta "${plan.name}"?`)) return;
    try { await api.removePlan(plan.id); setPlanId(null); setMsg(''); reloadPlans(); } catch (err) { setMsg(err.message); }
  };

  return (
    <Page title="Planta interativa" actions={plans?.length ? <button className="btn" onClick={() => setPlanForm({})}>Nova planta</button> : null}>
      <Err msg={perr || lerr || msg} />
      {plans && !plans.length && (
        <div className="empty-state">
          <h2>Nenhuma planta cadastrada</h2>
          <p>Envie a imagem da planta do local para posicionar os extintores sobre ela.</p>
          <button className="btn" onClick={() => setPlanForm({})}>Adicionar planta</button>
        </div>
      )}
      {plan && <>
        <div className="plan-bar">
          <div className="tabs">{plans.map(p => <button key={p.id} className={p.id === plan.id ? 'on' : ''} onClick={() => choose(p.id)}>{p.name}</button>)}</div>
          <div className="plan-tools">
            <button className="link" onClick={() => setPlanForm(plan)}>Editar planta</button>
            <button className="link danger" onClick={delPlan}>Excluir planta</button>
            <button className={'btn' + (adding ? ' ghost' : '')} onClick={() => { setAdding(a => !a); setSel(null); }}>{adding ? 'Cancelar' : 'Adicionar extintor'}</button>
          </div>
        </div>
        {adding && <p className="hint" role="status">Clique na planta no ponto onde o extintor está instalado.</p>}
        <div className="plan-wrap">
          <div ref={canvas} className={'plan-canvas' + (adding ? ' adding' : '')} onClick={place}>
            <img src={plan.image} alt={`Planta: ${plan.name}`} draggable="false" />
            {items.map(e => {
              const p = drag?.id === e.id ? drag : e;
              return (
                <button key={e.id} className={`pin ${e.status}${sel === e.id ? ' sel' : ''}${drag?.id === e.id ? ' dragging' : ''}`}
                  style={{ left: p.x + '%', top: p.y + '%' }} title={`${e.code} · ${e.location}`} aria-label={`${e.code}, ${e.location}`}
                  onPointerDown={ev => down(e, ev)} onPointerMove={move} onPointerUp={() => up(e)}
                  onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
                  onClick={ev => { ev.stopPropagation(); if (!adding) setSel(e.id); }}>{e.code.slice(-3)}</button>
              );
            })}
          </div>
          <aside className="side-card">
            <p className="count">{items.length} {items.length === 1 ? 'extintor' : 'extintores'} nesta planta</p>
            {cur ? <>
              <h2>{cur.code}</h2><Details e={cur} />
              <div className="side-actions">
                <button className="btn" onClick={() => setExtForm(cur)}>Editar</button>
                <button className="link danger" onClick={() => delExt(cur)}>Excluir</button>
              </div>
              <small>Arraste o pino na planta para mudar a posição.</small>
            </> : <p className="empty">Clique em um extintor da planta para ver os detalhes ou use “Adicionar extintor”.</p>}
            <div className="legend">{Object.entries(STATUS).map(([k, v]) => <span key={k}><i className={'dot ' + k} />{v}</span>)}</div>
          </aside>
        </div>
      </>}
      {extForm && <ExtForm initial={extForm} plans={plans} onClose={() => setExtForm(null)}
        onSaved={s => { setExtForm(null); setPlanId(s.planId); setSel(s.id); reloadList(); }} />}
      {planForm && <PlanForm plan={planForm} onClose={() => setPlanForm(null)}
        onSaved={p => { setPlanForm(null); setPlanId(p.id); setSel(null); reloadPlans(); }} />}
    </Page>
  );
}
