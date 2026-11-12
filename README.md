# firemap
Amanda Rech, Bianca Sobierai e Mariana Borges

 # Como abrir o FireMap

Este guia inicia o site no Codespaces para uso durante esta sessão. Mantenha os dois terminais abertos enquanto estiver usando o site.

## 1. Inicie o servidor da API

No VS Code, abra um terminal novo pelo botão **+**. Rode:

```bash
cd /workspaces/firemap/firemap/firemap/server
npm install
npm run dev
```

Deixe esse terminal aberto. A API deve informar que está rodando na porta `3001`.

## 2. Inicie o site

Abra outro terminal pelo botão **+** e rode:

```bash
cd /workspaces/firemap/firemap/firemap/cliente
npm install
npm run dev
```

Se `npm run dev` mostrar `Permission denied` ao executar o Vite, aprove o script do `esbuild` e tente novamente:

```bash
npm install-scripts approve esbuild
npm rebuild esbuild
npm run dev
```

## 3. Abra no navegador

No VS Code, abra a aba **Ports** e clique em **Open in Browser** na porta **5173**. Não abra a porta `3001`: ela é da API, não da página do site. Se aparecer `Cannot GET /`, provavelmente foi aberta a porta da API.

## 4. Entre no site

Use os dados de demonstração:

- **E-mail:** `admin@firemap.local`
- **Senha:** `admin123`

## Para usar depois

Se fechar os terminais ou o Codespace parar, inicie novamente os dois comandos `npm run dev`. O site e a API precisam estar rodando ao mesmo tempo. Os dados de demonstração ficam na memória do servidor e podem ser apagados quando ele reiniciar; este procedimento não publica o site para acesso permanente em outro computador.

Para parar os servidores, pressione **Ctrl+C** no terminal correspondente.
