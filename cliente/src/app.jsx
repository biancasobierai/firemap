import { useEffect, useState } from 'react';
import { api, getToken, setToken, onUnauthorized } from './api';
import { Logo } from './components';
import { Login } from './login';
import { Dashboard, Registry, Alerts, Chat } from './pages';
import { Plan } from './plan';

const NAV = [['dash', 'Painel', Dashboard], ['plan', 'Planta', Plan], ['reg', 'Extintores', Registry], ['alerts', 'Alertas', Alerts], ['chat', 'Assistente IA', Chat]];
export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const [tab, setTab] = useState('dash');
  const logout = () => { setToken(null); setUser(null); setTab('dash'); };
  useEffect(() => {
    onUnauthorized(logout); // token vencido: volta para o login
    if (getToken()) api.me().then(setUser).catch(() => {}).finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="boot">Carregando…</div>;
  if (!user) return <Login onLogin={u => { setUser(u); setTab('dash'); }} />;
  const Current = NAV.find(n => n[0] === tab)[2];
  return (
    <div className="app">
      <nav className="sidebar"><Logo />
        <ul>{NAV.map(([k, label]) => <li key={k}><button className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button></li>)}</ul>
        <div className="foot">
          <span className="who" title={user.email}>{user.name}</span>
          <button className="signout" onClick={logout}>Sair</button>
        </div>
      </nav>
      <main><Current key={tab} /></main>
    </div>
  );
}
