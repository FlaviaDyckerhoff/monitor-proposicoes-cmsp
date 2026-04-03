# 🏛️ Monitor Proposições CMSP — Câmara Municipal de São Paulo

Monitora automaticamente o sistema SPLEGIS da Câmara Municipal de São Paulo e envia email quando há proposições novas. Roda **4x por dia** via GitHub Actions (8h, 12h, 17h e 21h, horário de Brasília).

---

## Como funciona

1. O GitHub Actions roda o script nos horários configurados
2. O script chama o web service público do SPLEGIS (`splegisws.saopaulo.sp.leg.br`)
3. Filtra apenas os tipos de matéria monitorados (veja abaixo)
4. Compara as proposições recebidas com as já registradas no `estado.json`
5. Se há proposições novas → envia 1 email com a lista organizada por tipo
6. Salva o estado atualizado no repositório

---

## Tipos monitorados

| Sigla | Nome completo |
|-------|---------------|
| PL | Projeto de Lei |
| PDL | Projeto de Decreto Legislativo |
| PR | Projeto de Resolução |
| PLO | Projeto de Emenda à Lei Orgânica |
| MOC | Moção |
| IND | Indicação |
| REQ | Requerimento Plenário / Presidência |
| RPL | Requerimento de Plenário |
| AUD | Audiência Pública |
| RDS | Requerimento D Sem Processo |
| RPP | Requerimento P Com Processo |
| RPS | Requerimento P Sem Processo |
| RDP | Requerimento D Com Processo |
| REQCOM | Requerimento de Comissão |
| RSC | Requerimento Subcomissão |

Tipos **não monitorados** (excluídos por serem documentos internos de tramitação): DSP (Despacho), VOTO, REGTAQ, PAR, RELCOM, OF-*, ARQ, LISTPRE, e demais.

---

## Estrutura do repositório

```
monitor-proposicoes-cmsp/
├── monitor.js                      # Script principal
├── package.json                    # Dependências (só nodemailer)
├── estado.json                     # Estado salvo automaticamente pelo workflow
├── README.md                       # Este arquivo
└── .github/
    └── workflows/
        └── monitor.yml             # Workflow do GitHub Actions
```

---

## Setup — Passo a Passo

### PARTE 1 — Preparar o Gmail

**1.1** Acesse [myaccount.google.com/security](https://myaccount.google.com/security)

**1.2** Certifique-se de que a **Verificação em duas etapas** está ativa.

**1.3** Procure por **"Senhas de app"** e clique.

**1.4** Digite um nome qualquer (ex: `monitor-cmsp`) e clique em **Criar**.

**1.5** Copie a senha de **16 letras** gerada — ela só aparece uma vez.

> Se já usa App Password em outro monitor, pode reutilizar a mesma senha.

---

### PARTE 2 — Criar o repositório no GitHub

**2.1** Acesse [github.com](https://github.com) e clique em **+ → New repository**

**2.2** Preencha:
- **Repository name:** `monitor-proposicoes-cmsp`
- **Visibility:** Private

**2.3** Clique em **Create repository**

---

### PARTE 3 — Fazer upload dos arquivos

**3.1** Na página do repositório, clique em **"uploading an existing file"**

**3.2** Faça upload de:
```
monitor.js
package.json
README.md
```
Clique em **Commit changes**.

**3.3** O `monitor.yml` precisa estar numa pasta específica. Clique em **Add file → Create new file**, digite o nome:
```
.github/workflows/monitor.yml
```
Abra o arquivo `monitor.yml`, copie todo o conteúdo e cole. Clique em **Commit changes**.

---

### PARTE 4 — Configurar os Secrets

**4.1** No repositório: **Settings → Secrets and variables → Actions**

**4.2** Clique em **New repository secret** e crie os 3 secrets:

| Name | Valor |
|------|-------|
| `EMAIL_REMETENTE` | seu Gmail (ex: seuemail@gmail.com) |
| `EMAIL_SENHA` | a senha de 16 letras do App Password (sem espaços) |
| `EMAIL_DESTINO` | email onde quer receber os alertas |

---

### PARTE 5 — Testar

**5.1** Vá em **Actions → Monitor Proposições CMSP → Run workflow → Run workflow**

**5.2** Aguarde ~20 segundos. Verde = funcionou.

**5.3** O **primeiro run** envia 1 email com todas as proposições do ano atual (dos tipos monitorados) e salva o estado. A partir do segundo run, só envia se houver proposições novas.

---

## Email recebido

O email chega organizado por tipo, com número em ordem decrescente, e link direto para cada proposição no SP Legis:

```
🏛️ CMSP — 12 nova(s) proposição(ões)

PROJETO DE LEI — 3 proposição(ões)
  PL/324/2026 | 01/04/2026 | Dispõe sobre...          [ver]
  PL/323/2026 | 01/04/2026 | Institui o programa...   [ver]
  ...

MOÇÃO — 2 proposição(ões)
  MOC/45/2026 | 01/04/2026 | Manifesta apoio a...     [ver]
  ...
```

Quando o volume for alto (mais de 50 itens), um aviso aparece no topo do email.

---

## Horários de execução

| Horário BRT | Cron UTC |
|-------------|----------|
| 08:00 | 0 11 * * * |
| 12:00 | 0 15 * * * |
| 17:00 | 0 20 * * * |
| 21:00 | 0 0 * * * |

---

## API utilizada

```
Sistema:   SPLEGIS — Câmara Municipal de São Paulo
URL base:  https://splegisws.saopaulo.sp.leg.br/ws/ws2.asmx
Endpoint:  GET /ProjetosPorAnoJSON?Ano=2026
Docs:      https://www.saopaulo.sp.leg.br/transparencia/dados-abertos/dados-disponibilizados-em-formato-aberto/
```

Web service público, sem autenticação, sem reCAPTCHA.

---

## Resetar o estado

Para forçar o reenvio de todas as proposições (útil para testar):

1. No repositório, clique em `estado.json` → lápis
2. Substitua o conteúdo por:
```json
{"proposicoes_vistas":[],"ultima_execucao":""}
```
3. Commit → rode o workflow manualmente

---

## Problemas comuns

**Não aparece "Senhas de app" no Google**
→ Ative a verificação em duas etapas primeiro.

**Erro "Authentication failed" no log**
→ Verifique se `EMAIL_SENHA` foi colado sem espaços.

**Workflow não aparece em Actions**
→ Confirme que o arquivo está em `.github/workflows/monitor.yml`.

**Rodou mas não veio email**
→ Verifique o spam no primeiro run. Se não estiver lá, abra o log em Actions e procure por `❌` ou `⚠️`.

**Log mostra "0 proposições encontradas após filtro"**
→ A API do SPLEGIS pode estar fora do ar. Tente acessar `https://splegisws.saopaulo.sp.leg.br/ws/ws2.asmx/ProjetosPorAnoJSON?Ano=2026` no browser para confirmar.
