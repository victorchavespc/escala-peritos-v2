# Escala de Plantões — Itaberaba (v2.1)

Aplicativo web para montar e consultar a escala de plantões dos peritos de **Itaberaba**: rodízio oficial contínuo de 4 grupos (A · B · C · D, 24h × 72h) e escala extraoficial em duplas/trios, com conferência das cotas.

Evolução do [`escala.peritos`](https://github.com/victorchavespc/escala.peritos). Continua funcionando **sem internet e sem login** (salvando só no navegador) enquanto o Firebase não for configurado.

---

## O que a v2.1 traz

**Uma escala só, definida pelo administrador.** O e-mail `victorchaves.pc@gmail.com` é o único que altera a escala definitiva, autoriza pessoas e aprova propostas.

**Acesso por autorização.** Qualquer pessoa pode entrar com a conta Google, mas só vê a escala, os peritos e tudo de Itaberaba depois que o administrador autorizar.

**Propostas.** Quem for autorizado como *colaborador* pode sugerir mudanças ou montar a escala de um mês inteiro e enviar para aprovação. Quando o administrador aprova, a proposta **vira a escala definitiva do mês e o mês é fechado**.

## Quem pode o quê

| | Administrador | Colaborador | Leitor | Conta sem autorização |
|---|:---:|:---:|:---:|:---:|
| Ver a escala oficial, extraoficial, peritos, férias e equipes | ✅ | ✅ | ✅ | ❌ |
| Baixar agenda (.ics), imprimir, exportar imagem | ✅ | ✅ | ✅ | ❌ |
| Alterar peritos, grupos, férias, feriados e escalas definitivas | ✅ | ❌ | ❌ | ❌ |
| Fechar/reabrir meses, importar/exportar backup, ver versões | ✅ | ❌ | ❌ | ❌ |
| Criar, editar e enviar **propostas** (as próprias) | — | ✅ | ❌ | ❌ |
| Aprovar ou rejeitar propostas | ✅ | ❌ | ❌ | ❌ |
| Autorizar, mudar o papel ou revogar pessoas | ✅ | ❌ | ❌ | ❌ |
| Pedir acesso | — | — | — | ✅ |

Essas regras valem **no banco de dados**, não só na tela: mesmo quem abrir o console do navegador e tentar gravar à força é barrado (testado — veja “Segurança”).

## Como funciona no dia a dia

**Para quem entra pela primeira vez**
1. Abre o site e clica em **Entrar com Google**.
2. Vê “Falta pouco” e clica em **Solicitar acesso**.
3. Fica na tela “Pedido enviado”. Quando o administrador autorizar, a escala **abre sozinha**, sem recarregar.

**Para o administrador** (aba **Aprovações**)
- **Pedidos de acesso:** autorize como *Colaborador* (vê e propõe) ou *Só leitura*, ou negue. Também dá para autorizar um e-mail **antes** de a pessoa pedir.
- **Pessoas com acesso:** troque o papel a qualquer momento ou **Revogue** — a pessoa perde o acesso na hora e a cópia guardada no aparelho dela é apagada.
- **Propostas recebidas:** um aviso (número vermelho na aba e mensagem na tela) aparece quando chega proposta ou pedido. Clique em **Revisar**: você vê o mês com os dias alterados contornados em amarelo, a conferência de cotas e a observação do autor. Depois **Aprovar…** ou **Rejeitar…** (com motivo).
- Ao **aprovar**, o mês da proposta substitui o mês na escala definitiva e, por padrão, é **fechado** (a caixa “Fechar o mês” vem marcada). Equipes novas criadas na proposta entram na lista da definitiva.

**Para o colaborador** (aba **Propostas**)
1. Escolha o mês e se quer **começar da escala atual** (muda só o que precisar) ou **em branco**. Escreva uma observação, se quiser.
2. Monte como sempre: equipes, pincel avulso, arrastar sobre os dias. Pode criar duplas/trios novos (valem só dentro da proposta até serem aprovados).
3. Tudo salva sozinho como **rascunho**. Os dias diferentes da escala atual ficam contornados em amarelo.
4. **Enviar para aprovação.** Depois de enviada você não edita, mas pode **Retirar para editar** enquanto o administrador não decidir. Se for rejeitada, o motivo aparece e você pode **Reabrir para editar** e reenviar.
5. A escala definitiva **só muda** quando o administrador aprovar. Uma proposta nunca aparece como escala oficial: impressões, imagens e agenda levam a marca “PROPOSTA” ou ficam bloqueadas.

## Primeiro uso — passo a passo

### 1. Criar o projeto Firebase (gratuito, uns 10 minutos)
1. <https://console.firebase.google.com> › **Adicionar projeto** (nome: `escala-npf`; pode desativar o Google Analytics).
2. Na página do projeto, ícone **`</>`** (Web) › registre o app › copie o objeto `firebaseConfig`.
3. Cole esse objeto em [`config.js`](config.js), no lugar de `firebase: null`. O resto do arquivo já está pronto (administrador e unidade).
4. **Authentication › Começar › Método de login › Google › Ativar.**
5. **Authentication › Configurações › Domínios autorizados › Adicionar domínio:** `victorchavespc.github.io`.
6. **Firestore Database › Criar banco de dados** › local `southamerica-east1` (São Paulo) › **modo de produção**.
7. **Firestore Database › Regras:** apague tudo, cole o conteúdo de [`firestore.rules`](firestore.rules) e clique em **Publicar**.
   - ⚠️ **Estas regras substituem as da v2.** Publique antes de usar a v2.1.

### 2. Publicar o site (GitHub Pages)
**Settings › Pages › Deploy from a branch › `main` › `/ (root)` › Save.** Em 1–2 minutos: `https://victorchavespc.github.io/escala-peritos-v2/`.

### 3. Primeiro acesso do administrador (e o histórico da v1)
Entre com `victorchaves.pc@gmail.com`. Como a escala de Itaberaba ainda está vazia na nuvem, o app pergunta com o que começar:

- **Usar os dados deste navegador** — aparece se este navegador já tinha dados da escala (é o caso do navegador que você usava na v1/v2; o endereço `github.io` é o mesmo). **Um clique.**
- **Importar o histórico de um arquivo (.json)** — escolha o arquivo exportado pela versão anterior (botão *Exportar*). O app mostra uma prévia (peritos, equipes, meses, quantos fechados) antes de importar.
- **Usar os dados da versão 2 (sua conta)** — aparece se você chegou a usar o login da v2.
- **Começar do zero.**

Os meses já **fechados** continuam fechados e todos os dias lançados são mantidos. O histórico vira a escala definitiva e fica na nuvem; a partir daí é o que as pessoas autorizadas veem.

> **Por que o histórico não está neste repositório?** O repositório é público e o histórico tem nomes de colegas, férias e escalas. Ele fica só no seu navegador/arquivo e, depois da importação, no banco protegido por login — por isso a importação é feita por você, no primeiro acesso, e não vem “de fábrica”. O `.gitignore` impede que backups (`escala-npf*.json`, `*historico*.json`) sejam enviados ao GitHub sem querer.

## Segurança e privacidade

- **O banco só entrega dados a quem o administrador autorizou.** As regras (`firestore.rules`) conferem o e-mail verificado do Google em cada leitura e gravação. Sem login ou sem autorização, o banco recusa — mesmo que a pessoa conheça o endereço do site e a chave do `config.js`.
- **A chave (`apiKey`) do `config.js` não é segredo.** Só identifica o projeto; pode ficar pública. Quem protege são as regras.
- **O e-mail do administrador aparece em `config.js` e `firestore.rules`.** Como o repositório é público, qualquer pessoa pode ler esse e-mail (ele já aparece nos commits do projeto antigo). Isso não dá acesso a nada: o login exige a conta Google dele.
- **Nada do que vem de outras pessoas é executado.** Nome, e-mail, observações e motivos são sempre mostrados como texto; fotos só são exibidas se forem do Google. Backups importados e dados da nuvem passam por validação.
- **Testado com as regras reais** (86 verificações de permissão) e de ponta a ponta (administrador, colaborador, leitor e conta estranha): por exemplo, colaborador não grava a escala definitiva nem aprova a própria proposta, leitor não cria proposta, ninguém lê a escala de outra pessoa nem as versões guardadas, e a revogação vale na hora.
- Em **computador compartilhado**, use **Sair**. Para colaborador e leitor, a cópia local é apagada ao sair.
- **A página inicial não revela do que se trata.** Antes de a pessoa ter acesso, título, texto, ícone e descrição são neutros ("Acesso restrito") e a página pede aos buscadores para não ser indexada. O nome real só aparece depois de autorizado.
- **O motivo médico de afastamentos não é guardado.** Como todos os autorizados veem os afastamentos dos colegas, não existe opção "atestado médico" (registros antigos viram "Afastamento"). Evite escrever motivos de saúde em qualquer campo.
- **O app não abre dentro de quadro de outro site** (proteção contra clickjacking) e bloqueia plugins, `<base>` e envio de formulários.
- Campos livres das propostas têm limite de tamanho e o horário de envio é carimbado pelo servidor (um colaborador não consegue inchar documentos nem forjar a hora).
- Ao aprovar, o app confere se a proposta é **exatamente a que você revisou**; se mudou, avisa e não aplica.

## Checklist de segurança (o que só o administrador pode fazer)

1. **Verificação em duas etapas (ou chave de acesso/passkey) na conta `victorchaves.pc@gmail.com`.** Essa conta é a chave de tudo: quem entrar nela faz tudo.
2. **Republicar `firestore.rules` no console do Firebase sempre que o arquivo mudar** (Firestore Database › Regras › colar › Publicar). Alterar o arquivo no GitHub **não** atualiza o banco.
3. **Restringir a chave de API:** Google Cloud Console › APIs e serviços › Credenciais › chave do navegador › Restrições de aplicativos › *Referenciadores HTTP* › `https://victorchavespc.github.io/*` e `https://escala-npf.firebaseapp.com/*`.
4. **Manter o plano gratuito (Spark)**, sem cartão: assim o pior caso de abuso é a cota acabar, nunca uma cobrança.
5. Em *Authentication › Método de login*, deixar **somente Google** ligado (e-mail/senha e anônimo desligados).
6. **Revisar de tempos em tempos** quem está em *Aprovações › Pessoas com acesso* e revogar quem não precisa mais.
7. **Repositório público:** o nome, o README e o `config.js` mencionam a unidade e a profissão. Quem quiser sigilo total pode tornar o repositório privado (o GitHub Pages em repositório privado exige plano pago; alternativa gratuita: Firebase Hosting) ou renomeá-lo. Se o repositório antigo `escala.peritos` ainda tiver o Pages ativado, ele continua publicando a versão 1 — desative em *Settings › Pages* ou torne-o privado.

**Riscos que continuam, por desenho:** qualquer conta Google pode *pedir* acesso (o administrador nega; não custa nada); um colaborador pode criar muitas propostas (revogue o acesso); quem abrir o código-fonte da página vê os rótulos do app (nunca os dados); o login do Firebase é carregado do servidor do Google (versão fixa).

## Sem internet

- **Administrador:** abre com a cópia deste aparelho; o que alterar sobe sozinho quando a conexão voltar. Se a nuvem tiver uma versão diferente, o app pergunta qual manter (a outra fica guardada em *Configurações › Versões salvas*).
- **Colaborador/leitor:** abre a última cópia da escala em modo leitura. Propostas precisam de conexão.
- Só abre offline quem já teve acesso confirmado **naquele aparelho**.

## Atualizando da v2

1. Publique as novas **regras** (passo 1.7).
2. A v2 guardava “uma escala por conta”. Na v2.1 existe **uma escala de Itaberaba**. No primeiro acesso, o app oferece trazer os dados da v2 (ou do navegador).
3. Evite usar a v1/v2 e a v2.1 ao mesmo tempo no mesmo navegador.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | estrutura da página |
| `assets/estilo.css` | visual (claro/escuro, celular, impressão) |
| `assets/app.js` | lógica da escala, papéis e propostas (funciona sem internet) |
| `assets/acesso.js` | tela de acesso, aba Propostas/Aprovações e barra da proposta |
| `assets/nuvem.js` | login Google e sincronização com o Firestore |
| `config.js` | **configuração**: Firebase, e-mail do administrador, nome da unidade |
| `firestore.rules` | regras de segurança do banco (copiar para o console do Firebase) |
| `firebase.json` | uso opcional com o Firebase CLI e emuladores |

## Limites e ideias para depois

- **Avisos só na tela.** Não há e-mail/WhatsApp automático quando chega um pedido ou proposta (isso exigiria um serviço pago). O administrador vê o número vermelho na aba **Aprovações** ao abrir o app.
- A proposta cobre **um mês da escala extraoficial**. Mudanças em peritos, grupos, férias e feriados continuam sendo só do administrador.
- Ideias: ligar cada conta a um perito (“minha escala” em destaque), pedidos de troca de plantão entre colegas, instalar como aplicativo no celular (PWA) e relatórios de plantões por período.
