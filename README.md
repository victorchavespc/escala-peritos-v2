# Escala de Plantões — v2

Aplicativo web para montar a escala de plantões dos peritos: rodízio oficial contínuo de 4 grupos (A · B · C · D, 24h × 72h) e montagem da escala extraoficial em duplas/trios, com conferência das cotas.

Esta é a evolução do projeto [`escala.peritos`](https://github.com/victorchavespc/escala.peritos). Os dados que já estavam salvos no navegador são aproveitados automaticamente.

---

## O que mudou na v2

### Login com Google e dados na nuvem
- **Entrar com Google** (Firebase Authentication): a escala fica salva na sua conta e você abre em qualquer computador ou celular.
- **Sessão persistente**: você continua conectado até clicar em *Sair*. Em computador compartilhado, desmarque *Manter conectado* e a sessão termina ao fechar a aba.
- **Sincronização em tempo real** entre dispositivos (Cloud Firestore).
- **Funciona sem internet**: uma cópia fica no navegador. O que você alterar offline é enviado quando a conexão voltar.
- **Conflitos tratados**: se a mesma conta tiver versões diferentes em dois lugares, o app pergunta qual manter, e a outra fica guardada.
- **Versões salvas**: uma cópia por dia fica na sua conta (60 dias) e no navegador (14 dias). Dá para restaurar em *Configurações › Versões salvas*.
- **Ao sair**, você escolhe entre apagar ou manter a cópia deste navegador.
- Sem configurar o Firebase, o app funciona como antes, salvando só no navegador.

### Novas funções
- **Desfazer / Refazer** (botões e `Ctrl+Z` / `Ctrl+Y`) para qualquer alteração.
- **Confirmação** antes de remover perito, limpar mês, copiar mês anterior, aplicar acordo base por cima de dias lançados e importar backup.
- **Arrastar para pintar**: clique e arraste sobre vários dias (mouse ou toque).
- **Afastamentos com tipo**: férias, licença, atestado médico, curso/capacitação ou outro. Todos descontam da cota.
- **Alertas na conferência**: perito escalado durante afastamento, com os dias, e lista dos dias sem ninguém escalado.
- **Equidade**: fins de semana e feriados de cada perito no mês e no ano, para distribuir de forma justa.
- **Feriados personalizados**: feriados municipais e pontos facultativos, além dos nacionais e da Bahia que já vinham.
- **Destacar perito**: realça os dias de um perito nos calendários.
- **Agenda (.ics)**: baixa os plantões do perito destacado para o Google Agenda, Outlook ou celular. Na escala oficial, cobre os próximos 12 meses; na extraoficial, o mês aberto. O horário de início do plantão é configurável.
- **Botão “Hoje”**, marcação do dia atual e busca de peritos quando a lista é grande.

### Visual e usabilidade
- **Tema escuro**: automático (segue o sistema) ou escolhido manualmente.
- Barra de abas fixa no topo, com desfazer/refazer, status da nuvem, conta, tema e configurações.
- Diálogos próprios no lugar dos avisos do navegador, e avisos com botão *Desfazer*.
- Celular: lista por padrão na escala oficial, calendário logo após as equipes na extraoficial, sem rolagem horizontal.
- Acessibilidade: abas navegáveis pelo teclado, rótulos para leitores de tela e foco visível.

### Segurança (hardening)
- Todo dado que entra (backup importado, nuvem ou navegador) passa por **sanitização**: nomes, cores, datas e IDs são validados. Isso impede que um arquivo `.json` adulterado injete código na página.
- Na nuvem, cada pessoa só lê e grava a **própria** escala, e só se o e-mail estiver na lista autorizada das regras do Firestore. As regras também recusam campos inesperados e documentos grandes demais.

---

## Publicar (GitHub Pages)

1. No GitHub, abra o repositório › **Settings › Pages**.
2. Em *Build and deployment*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e clique em **Save**.
3. Em 1–2 minutos o app estará em `https://victorchavespc.github.io/escala-peritos-v2/`.

> Como o endereço é o mesmo domínio (`victorchavespc.github.io`) do app antigo, a v2 já abre com os dados que estavam salvos no navegador. Evite usar as duas versões ao mesmo tempo no mesmo navegador: o app antigo não conhece os feriados personalizados e pode apagá-los ao salvar.

## Ativar o login com Google e salvar na nuvem

Leva uns 10 minutos e é gratuito: o plano *Spark* do Firebase sobra para uma escala.

1. **Criar o projeto**: acesse <https://console.firebase.google.com>, clique em **Adicionar projeto**, dê um nome (ex.: `escala-npf`) e pode desativar o Google Analytics.
2. **Registrar o app web**: na página do projeto, clique no ícone **`</>`** (Web), dê um apelido e clique em **Registrar app**. Copie o objeto `firebaseConfig` que aparece.
3. **Colar a configuração**: no arquivo [`config.js`](config.js), troque `firebase: null` pelo objeto copiado. Salve e envie para o GitHub.
4. **Ativar o login Google**: em **Authentication › Começar › Método de login**, ative o provedor **Google**, escolha o e-mail de suporte e clique em **Salvar**.
5. **Autorizar o endereço do site**: em **Authentication › Configurações › Domínios autorizados**, clique em **Adicionar domínio** e informe `victorchavespc.github.io`.
6. **Criar o banco**: em **Firestore Database › Criar banco de dados**, escolha o local **`southamerica-east1` (São Paulo)** e o **modo de produção**.
7. **Regras de segurança**: em **Firestore Database › Regras**, apague o conteúdo e cole o arquivo [`firestore.rules`](firestore.rules). **Troque `seu-email@gmail.com`** pelo(s) e-mail(s) Google autorizado(s), em minúsculas, e clique em **Publicar**.
8. *(Opcional)* Coloque os mesmos e-mails em `emailsPermitidos` no `config.js`. Assim, quem não estiver na lista vê um aviso amigável logo ao entrar.
9. Abra o site e clique em **Entrar com Google**. Na primeira vez, os dados que já estão no navegador são enviados para a sua conta.

**A `apiKey` do `config.js` não é segredo.** Ela só identifica o projeto Firebase e pode ficar pública. Quem protege os dados são as **regras do Firestore** (passo 7). Como reforço opcional, restrinja a chave ao seu domínio em <https://console.cloud.google.com/apis/credentials>: abra a chave do navegador › *Restrições de aplicativos* › *Referenciadores HTTP* › `https://victorchavespc.github.io/*`.

### Como os dados ficam guardados

| Onde | O quê |
|---|---|
| `escalas/{seu uid}` | a escala inteira (peritos, equipes, meses, feriados, configurações) |
| `escalas/{seu uid}/historico/{data}` | uma versão por dia, mais as cópias guardadas ao resolver conflitos |
| `localStorage` do navegador | cópia para abrir rápido e funcionar offline, preferências (tema, visualização) e versões locais |

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | estrutura da página |
| `assets/estilo.css` | visual (temas claro e escuro, impressão) |
| `assets/app.js` | toda a lógica da escala (funciona sem internet) |
| `assets/nuvem.js` | login Google + sincronização com o Firestore (carregado só quando há configuração) |
| `config.js` | **configuração do Firebase**: o único arquivo que você precisa editar |
| `firestore.rules` | regras de segurança do banco (copiar para o console do Firebase) |
| `firebase.json` | uso opcional com o Firebase CLI e os emuladores |
| `index-antigo*.html` | versões anteriores, mantidas como referência |

## Ideias para próximas versões
- **Escala compartilhada**: vários peritos/coordenadores editando ou só consultando a mesma escala, com papéis de editor e leitor.
- **Instalar como aplicativo** no celular (PWA), com ícone na tela inicial.
- **Pedidos de troca de plantão** com aprovação e registro de quem trocou com quem.
- **Relatórios** de horas e plantões por período, para conferência administrativa.
