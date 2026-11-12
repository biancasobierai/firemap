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
Abra o terminal no VS Code (`Ctrl + '`) e instale os pacotes do projeto:
```bash
npm install
```
*(Caso o frontend fique em uma subpasta separada, como `client` ou `frontend`, entre nela com `cd nome-da-pasta` e rode `npm install` novamente).*

### Configurar a senha de administrador (Opcional)
Para remover o aviso de senha padrão (`admin123`), crie ou edite o arquivo `.env` dentro da pasta `server` (`server/.env`) e adicione:
```env
ADMIN_PASSWORD=sua_nova_senha
JWT_SECRET=sua_chave_secreta
```

---

## 2. Executando a Aplicação

A aplicação precisa de **dois terminais abertos simultaneamente** no VS Code: um para a API e outro para a interface visual do site.

### Passo 1: Iniciar o Backend (Porta 3001)
1. No terminal do VS Code (`Ctrl + '`), inicie o servidor da API:
   ```bash
   node index.js
   ```
   *(Ou `npm start` / `npm run server`, conforme configurado no `package.json`).*
2. Aguarde o servidor iniciar na porta **3001** e **mantenha este terminal aberto**.

### Passo 2: Iniciar o Frontend (Porta 5173)
1. Clique no ícone **`+`** no canto superior direito do painel de terminal do VS Code para abrir um **segundo terminal**.
2. Caso o site fique em uma pasta separada, entre nela (ex: `cd client`).
3. Rode o comando de desenvolvimento:
   ```bash
   npm run dev
   ```
4. Aguarde aparecer o endereço local na porta **5173**.

---

## 3. Acessar no Navegador

1. Abra seu navegador (Chrome, Edge, etc.).
2. Acesse exatamente o endereço do frontend:
   👉 **http://localhost:5173**

> **⚠️ Atenção:** Não abra `http://localhost:3001` no navegador. A porta `3001` é exclusiva da API e exibirá `Cannot GET /` se acessada diretamente.

---

## Solução de Problemas Comuns

### Erro `EADDRINUSE: address already in use :::3001`
Significa que uma execução anterior da API ficou presa em segundo plano ocupando a porta `3001`. Para encerrar o processo travado, execute no terminal:
* **No CMD:** `taskkill /F /IM node.exe`
* **No PowerShell:** `Stop-Process -Name "node" -Force`

Depois disso, repita os passos da seção **2. Executando a Aplicação**.
