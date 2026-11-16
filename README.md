# Como Rodar a Aplicação (Firemap)

Este guia contém o passo a passo para iniciar o **Backend (API)** e o **Frontend (Site)** localmente usando o Visual Studio Code.

---

## Pré-requisitos

* **Node.js** instalado na máquina.
* **Visual Studio Code** aberto na pasta raiz do projeto (`firemap`).

---

## 1. Preparação Inicial (Apenas na primeira vez)

### Liberar scripts no Windows (se der erro de permissão)
Caso o terminal do VS Code bloqueie comandos `npm`, abra o **PowerShell como Administrador** no Windows e execute:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
*(Digite `S` e pressione Enter para confirmar).*

### Instalar as dependências
Instale as dependências em cada pacote:
```bash
cd server
npm install
cd ../cliente
npm install
```

### Configurar o Supabase
1. No painel do Supabase, abra **SQL Editor** e execute o conteúdo de [`server/schema.sql`](server/schema.sql). Isso cria `app_users`, `plans` e `extinguishers`.
2. Em **Project Settings > API Keys**, configure a URL do projeto e uma chave **Secret** em `server/.env`:
```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sua_chave_secret
ADMIN_PASSWORD=sua_nova_senha
JWT_SECRET=sua_chave_secreta
```
Não use a chave `Publishable` como `SUPABASE_SECRET_KEY` e não exponha a chave Secret no frontend.

Na primeira inicialização, o backend cria o administrador e, se ainda não houver plantas, carrega os dados de demonstração.

---

## 2. Executando a Aplicação

A aplicação precisa de **dois terminais abertos simultaneamente** no VS Code: um para a API e outro para a interface visual do site.

### Passo 1: Iniciar o Backend (Porta 3001)
1. No terminal do VS Code (`Ctrl + '`), entre em `server` e inicie a API:
   ```bash
   cd server
   npm run dev
   ```
2. Aguarde o servidor iniciar na porta **3001** e **mantenha este terminal aberto**.

### Passo 2: Iniciar o Frontend (Porta 5173)
1. Clique no ícone **`+`** no canto superior direito do painel de terminal do VS Code para abrir um **segundo terminal**.
2. Entre na pasta `cliente`.
3. Rode o comando de desenvolvimento:
   ```bash
   cd cliente
   npm run dev
   ```
4. Abra o endereço local mostrado pelo Vite. Se a porta **5173** estiver ocupada, ele escolherá outra.

---

## 3. Acessar no Navegador

1. Abra seu navegador (Chrome, Edge, etc.).
2. Acesse o endereço do frontend mostrado pelo Vite, normalmente **http://localhost:5173**.

> **⚠️ Atenção:** Não abra `http://localhost:3001` no navegador. A porta `3001` é exclusiva da API e exibirá `Cannot GET /` se acessada diretamente.

---

## Solução de Problemas Comuns

### Erro `EADDRINUSE: address already in use :::3001`
Significa que uma execução anterior da API ficou presa em segundo plano ocupando a porta `3001`. Para encerrar o processo travado, execute no terminal:
* **No CMD:** `taskkill /F /IM node.exe`
* **No PowerShell:** `Stop-Process -Name "node" -Force`

Depois disso, repita os passos da seção **2. Executando a Aplicação**.
