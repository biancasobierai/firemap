import { useState } from 'react';
import { api, setToken } from './api';
import { Logo, Err } from './components';

// Croqui decorativo: a planta com pinos é a identidade do produto
const Sketch = () => (
  <svg viewBox="0 0 100 60" className="login-sketch" aria-hidden="true">
    <rect x="1" y="1" width="98" height="58" fill="none" stroke="currentColor" strokeWidth=".6" />
    {[[1, 1, 38, 36], [39, 1, 24, 36], [63, 1, 36, 20], [63, 21, 36, 16], [1, 37, 62, 22], [63, 37, 36, 22]].map((r, i) =>
      <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} fill="none" stroke="currentColor" strokeWidth=".35" />)}
    {[[14, 20, '#2f855a'], [50, 28, '#2f855a'], [80, 11, '#c77700'], [30, 48, '#2f855a'], [84, 47, '#d71920']].map(([x, y, c], i) =>
      <g key={i}><circle cx={x} cy={y} r="2.6" fill={c} stroke="#fff" strokeWidth=".5" /></g>)}
  </svg>
);

export function Login({ onLogin }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [show, setShow] = useState(false); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async ev => {
    ev.preventDefault(); setBusy(true); setMsg('');
    try { const { token, user } = await api.login(email, password); setToken(token); onLogin(user); }
    catch (e) { setMsg(e.message); setBusy(false); }
  };
  return (
    <div className="login">
      <aside className="login-art">
        <Logo />
        <Sketch />
        <p>Veja onde cada extintor está e quando precisa de manutenção.</p>
      </aside>
      <main className="login-main">
        <form className="login-form" onSubmit={submit}>
          <h1>Entrar</h1>
          <label>E-mail
            <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>Senha
            <span className="pw">
              <input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
              <button type="button" className="link" onClick={() => setShow(s => !s)} aria-pressed={show}>{show ? 'Ocultar' : 'Mostrar'}</button>
            </span>
          </label>
          <Err msg={msg} />
          <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </main>
    </div>
  );
}
