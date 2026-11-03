// Nuvem (Firebase) da escala de Itaberaba: login com Google + Cloud Firestore.
// Só é ativada quando config.js traz a configuração do Firebase; sem ela o app funciona só no navegador.
//
// Modelo no Firestore (regras em firestore.rules):
//   unidades/itaberaba                     → escala DEFINITIVA {json, rev, versao, atualizadoEm, atualizadoPor, dispositivo}
//                                            (todos os autorizados leem; só o administrador grava)
//   unidades/itaberaba/historico/{id}      → versões diárias e cópias de segurança (só o administrador)
//   unidades/itaberaba/acessos/{e-mail}    → pedidos e autorizações {status: pendente|autorizado|negado, papel: colaborador|leitor}
//   unidades/itaberaba/propostas/{id}      → propostas de escala do mês {status: rascunho|enviada|aprovada|rejeitada, dias, equipes…}

const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
const App = window.EscalaApp;
const CFG = window.ESCALA_CONFIG || {};
const MESTRE = String(CFG.mestre || "").trim().toLowerCase();
const ESPERA_GRAVACAO_MS = 1200;   // agrupa cliques seguidos em uma única gravação
const ESPERA_ABERTURA_MS = 12000;  // sem resposta da nuvem: abre com a cópia deste aparelho (só se já houve acesso confirmado)
const DIAS_VERSOES = 60;           // versões mais antigas que isso são apagadas
const DIAS_LISTA = 30;             // versões mostradas em Configurações

const pad2 = n => (n < 10 ? "0" + n : "" + n);
const diaISO = atras => { const d = new Date(Date.now() - atras * 86400000); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); };
const hojeISO = () => diaISO(0);
const carimbo = () => { const d = new Date(); return hojeISO() + "_" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()); };
const dorme = ms => new Promise(r => setTimeout(r, ms));
const ms = ts => (ts && typeof ts.toMillis === "function" ? ts.toMillis() : null);
const definir = patch => App.nuvem.definir(patch);
const status = (st, extra) => definir(Object.assign({ status: st, detalhe: "" }, extra || {}));
const NOME_MES = chave => { const m = /^(\d{4})-(\d{1,2})$/.exec(chave || ""); return m ? App.util.nomeMesAno(+m[1], +m[2]) : "o mês"; };

// Abre o app com a última sessão confirmada neste aparelho (sem internet ou serviço fora do ar).
async function abrirOffline(motivo) {
  await App.pronto;
  const s = App.sessao.ler();
  if (s && s.uid && (s.papel === "mestre" || s.papel === "colaborador" || s.papel === "leitor")) {
    await App.entrarModo(s.papel, { uid: s.uid });
    definir({
      usuario: { nome: s.nome || "", email: s.email || "", foto: "", uid: s.uid },
      status: "offline",
      detalhe: motivo + (s.papel === "mestre" ? " Suas alterações ficam neste aparelho e sobem quando a conexão voltar." : " Você está vendo a última cópia salva neste aparelho (somente leitura)."),
      acesso: { estado: "ativo", papel: s.papel }
    });
    return true;
  }
  definir({ acesso: { estado: "erro", detalhe: motivo + " Verifique a internet e tente de novo." }, status: "erro" });
  return false;
}

if (App && App.nuvemAtiva) carregar();

function carregar() {
  iniciar().catch(err => {
    console.error("Falha ao iniciar a nuvem:", err);
    abrirOffline("Não foi possível carregar o serviço de login.");
    window.addEventListener("online", carregar, { once: true });
  });
}

async function iniciar() {
  const [fbApp, fbAuth, fs] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js")
  ]);
  await App.pronto;

  const app = fbApp.initializeApp(CFG.firebase);
  const auth = fbAuth.getAuth(app);
  auth.useDeviceLanguage();
  const db = fs.getFirestore(app);
  if (CFG.emuladores) { // apenas para testes locais
    fbAuth.connectAuthEmulator(auth, CFG.emuladores.auth, { disableWarnings: true });
    fs.connectFirestoreEmulator(db, CFG.emuladores.firestoreHost, CFG.emuladores.firestorePort);
  }
  const refUnidade = fs.doc(db, "unidades", "itaberaba");
  const refAcessos = fs.collection(refUnidade, "acessos");
  const refProps = fs.collection(refUnidade, "propostas");
  const refHist = fs.collection(refUnidade, "historico");
  const dispositivo = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  let usuario = null;          // usuário Firebase conectado
  let email = "";              // e-mail em minúsculas
  let papelAtual = null;       // 'mestre' | 'colaborador' | 'leitor'
  let desmontagens = [];       // encerram os "ouvintes" em tempo real (escala, propostas, pedidos…)
  let pararAcesso = null;      // ouvinte do PRÓPRIO pedido de acesso: fica ligado enquanto a pessoa estiver conectada
  let esperaAbertura = null;
  // administrador: escala definitiva
  let sincronizado = false;    // já comparou a nuvem com este navegador depois do login?
  let iniciando = false;
  let docAtrasado = undefined; // documento que chegou durante a comparação inicial
  let timer = null, gravando = false, reenviar = false;
  let ultimaRev = 0;           // rev da última gravação feita por este aparelho (para ignorar o "eco")
  let limpezaFeita = false;
  let primeiroAcessoResolver = null, legadoJson = null;
  // colaborador: proposta aberta
  let timerProp = null, propPendente = null;
  let ultimoJsonDef = null;

  const meta = () => App.sync.ler();
  const gravarMeta = m => App.sync.gravar(m);

  function mensagemErro(e) {
    const c = (e && e.code) || "";
    if (c === "permission-denied") return "Sem permissão no Firestore: confira se as regras de segurança foram publicadas e se sua conta tem acesso.";
    if (c === "unavailable") return "Servidor indisponível ou sem internet. As alterações continuam neste aparelho e serão enviadas depois.";
    if (c === "resource-exhausted") return "Limite gratuito diário do Firebase atingido. Tente novamente amanhã.";
    if (c === "unauthenticated") return "Sessão expirada. Entre novamente.";
    return "Erro ao falar com a nuvem" + (c ? " (" + c + ")" : "") + ".";
  }
  function mensagemLogin(e) {
    const c = (e && e.code) || "";
    if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request" || c === "auth/user-cancelled") return null;
    if (c === "auth/popup-blocked") return "O navegador bloqueou a janela de login. Permita pop-ups para este site e tente de novo.";
    if (c === "auth/unauthorized-domain") return "Este endereço não está autorizado no Firebase (Authentication › Configurações › Domínios autorizados).";
    if (c === "auth/operation-not-allowed") return "O login com Google não está ativado no projeto Firebase.";
    if (c === "auth/network-request-failed") return "Sem conexão com a internet.";
    return "Não foi possível entrar" + (c ? " (" + c + ")" : "") + ".";
  }
  const docParaObj = d => {
    const v = d.data({ serverTimestamps: "estimate" });
    return Object.assign({ id: d.id }, v, { criadoEm: ms(v.criadoEm), atualizadoEm: ms(v.atualizadoEm), enviadoEm: ms(v.enviadoEm), decididoEm: ms(v.decididoEm), solicitadoEm: ms(v.solicitadoEm) });
  };

  // ---------- Encerrar tudo (troca de usuário, saída, perda de acesso) ----------
  function desmontar() {
    desmontagens.forEach(f => { try { f(); } catch (e) { /* já encerrado */ } });
    desmontagens = [];
    if (pararAcesso) { try { pararAcesso(); } catch (e) { /* já encerrado */ } pararAcesso = null; }
    clearTimeout(esperaAbertura); esperaAbertura = null;
    clearTimeout(timer); timer = null; reenviar = false;
    clearTimeout(timerProp); timerProp = null; propPendente = null;
    sincronizado = false; iniciando = false; docAtrasado = undefined; limpezaFeita = false;
    primeiroAcessoResolver = null; legadoJson = null; ultimoJsonDef = null; papelAtual = null;
    definir({ acessos: [], acessosCarregados: false, propostas: [], propostasCarregadas: false });
  }
  // A pessoa não (ou não mais) tem acesso: encerra a visualização, apaga a cópia deste aparelho e volta para a tela de acesso.
  // O ouvinte do próprio pedido continua ligado — é ele que avisa quando o administrador autorizar.
  function encerrarVisualizador(estadoGate, extra) {
    desmontagens.forEach(f => { try { f(); } catch (e) { /* já encerrado */ } });
    desmontagens = [];
    clearTimeout(timerProp); timerProp = null; propPendente = null; ultimoJsonDef = null; papelAtual = null;
    if (App.estado.papel) App.sairModo({ apagarCache: true });
    App.sessao.limpar();
    definir({ acesso: Object.assign({ estado: estadoGate }, extra || {}), status: "desconectado", propostas: [], propostasCarregadas: false });
  }
  function armarEsperaAbertura() {
    clearTimeout(esperaAbertura);
    esperaAbertura = setTimeout(() => {
      const e = App.nuvem.info.acesso.estado;
      if (usuario && (e === "verificando" || e === "conectando")) abrirOffline("A nuvem não respondeu.");
    }, ESPERA_ABERTURA_MS);
  }

  // =====================================================================
  //  Escala definitiva — administrador (grava) e demais (só leem)
  // =====================================================================

  // ---------- Administrador: gravação (navegador → nuvem) ----------
  App.aoMudar((json, origem) => { if (origem !== "nuvem") agendar(); });

  function agendar() {
    if (papelAtual !== "mestre" || !usuario || !sincronizado) return;
    clearTimeout(timer);
    timer = setTimeout(enviar, ESPERA_GRAVACAO_MS);
    if (navigator.onLine) status("salvando");
    else status("offline", { detalhe: "Sem internet — as alterações ficam neste aparelho e serão enviadas quando a conexão voltar." });
  }

  async function enviar() {
    clearTimeout(timer); timer = null;
    if (papelAtual !== "mestre" || !usuario || !sincronizado) return;
    if (gravando) { reenviar = true; return; }
    gravando = true;
    const u = usuario, json = App.obterJSON();
    const m = meta(), revAnterior = (m.uid === u.uid && m.rev) || 0, rev = revAnterior + 1;
    gravarMeta({ uid: u.uid, rev, pendente: true });
    ultimaRev = rev;
    try {
      await Promise.all([
        fs.setDoc(refUnidade, { json, rev, versao: 3, atualizadoEm: fs.serverTimestamp(), atualizadoPor: email, dispositivo }),
        fs.setDoc(fs.doc(refHist, hojeISO()), { json, rev, salvoEm: fs.serverTimestamp() }).catch(e => console.warn("Versão diária não gravada:", e))
      ]);
      if (usuario !== u) return;
      if (!timer && !reenviar && App.obterJSON() === json) { const mm = meta(); mm.pendente = false; gravarMeta(mm); }
      status("salvo", { salvoEm: Date.now() });
    } catch (e) {
      console.error("Falha ao gravar na nuvem:", e);
      const mm = meta(); if (mm.rev === rev) { mm.rev = revAnterior; gravarMeta(mm); }
      if (usuario === u) status("erro", { detalhe: mensagemErro(e) });
      throw e;
    } finally {
      gravando = false;
      if (reenviar && usuario === u) { reenviar = false; agendar(); }
    }
  }
  // Envia o que estiver pendente e espera terminar (usado antes de aprovar uma proposta e ao sair).
  async function esperarGravacao() {
    if (papelAtual !== "mestre") return;
    if (timer) { try { await enviar(); } catch (e) { /* o laço abaixo decide */ } }
    for (let i = 0; i < 100 && (gravando || timer); i++) await dorme(100);
    if (meta().pendente) throw new Error("A escala definitiva ainda não foi salva na nuvem.");
  }

  // Guarda no histórico uma versão que vai ser substituída (para poder recuperar depois).
  function guardarCopia(json, rotulo) {
    if (!json) return Promise.resolve();
    return fs.setDoc(fs.doc(refHist, carimbo() + "_" + (rotulo === "conta" ? "nuvem" : "navegador")),
      { json, rev: 0, salvoEm: fs.serverTimestamp(), rotulo: rotulo === "conta" ? "versão da nuvem substituída" : "cópia do navegador substituída" })
      .catch(e => console.warn("Cópia de segurança não gravada:", e));
  }

  // ---------- Administrador: leitura (nuvem → navegador) e primeira sincronização ----------
  async function iniciarMestre(user) {
    await App.entrarModo("mestre", { uid: user.uid });
    if (usuario !== user) return;
    papelAtual = "mestre";
    definir({ acesso: { estado: "verificando" }, status: "sincronizando" });
    desmontagens.push(fs.onSnapshot(refUnidade, { includeMetadataChanges: true }, snap => {
      if (usuario !== user) return;
      if (snap.metadata.fromCache) { // ainda sem resposta do servidor: nunca decidir com base no cache
        if (!sincronizado) {
          if (!navigator.onLine) abrirOffline("Sem conexão com a internet.");
          else status("sincronizando");
        }
        return;
      }
      if (snap.metadata.hasPendingWrites) return;
      const d = snap.exists() ? snap.data() : null;
      if (iniciando) { docAtrasado = d; return; }
      if (!sincronizado) { sincronizacaoInicial(user, d); return; }
      processarRemoto(d);
    }, e => {
      console.error("Falha ao ler a escala:", e);
      if (usuario === user) { definir({ acesso: { estado: "erro", detalhe: mensagemErro(e) } }); status("erro", { detalhe: mensagemErro(e) }); }
    }));
    escutarAcessosDoMestre(user);
    escutarPropostasDoMestre(user);
    armarEsperaAbertura();
  }

  function abrirComoMestre(user) {
    App.sessao.gravar({ uid: user.uid, email, nome: user.displayName || "", papel: "mestre" });
    clearTimeout(esperaAbertura);
    definir({ acesso: { estado: "ativo", papel: "mestre" } });
  }

  function processarRemoto(d) {
    if (!d || typeof d.json !== "string") return;
    if (d.dispositivo === dispositivo && d.rev === ultimaRev) return; // eco da própria gravação
    const m = meta();
    if (timer || gravando) {
      // alteração simultânea em outro aparelho: a deste aparelho será gravada por último e prevalece
      gravarMeta({ uid: usuario.uid, rev: Math.max(m.rev || 0, d.rev || 0), pendente: true });
      if (App.canonico(d.json) !== App.obterJSON()) App.toast("Houve alteração em outro aparelho ao mesmo tempo. A versão deste aparelho foi mantida.");
      reenviar = true;
      return;
    }
    gravarMeta({ uid: usuario.uid, rev: d.rev || 0, pendente: false });
    if (App.aplicarRemoto(d.json)) App.toast("Escala atualizada com alterações feitas em outro aparelho.");
    status("salvo", { salvoEm: ms(d.atualizadoEm) || Date.now() });
  }

  async function sincronizacaoInicial(user, d) {
    iniciando = true;
    try {
      const m = meta(), mesmoUsuario = m.uid === user.uid, local = App.obterJSON();
      if (!d || typeof d.json !== "string") {
        // A escala de Itaberaba ainda não existe na nuvem: o administrador escolhe com o que começar.
        await primeiroAcesso(user);
        if (usuario !== user) return;
        sincronizado = true;
        gravarMeta({ uid: user.uid, rev: 0, pendente: true });
        await enviar();
      } else {
        let usar, perguntou = false;
        if (App.canonico(d.json) === local) usar = "igual";
        else if (mesmoUsuario && !m.pendente) usar = "nuvem";                    // nada novo aqui: vale a nuvem
        else if (mesmoUsuario && m.pendente && d.rev === m.rev) usar = "local";  // editado offline sobre a última versão
        else if (!App.temDados()) usar = "nuvem";
        else { usar = await perguntar(d); perguntou = true; }
        if (usuario !== user) return;
        sincronizado = true;
        if (usar === "local") {
          if (perguntou) await guardarCopia(d.json, "conta");
          gravarMeta({ uid: user.uid, rev: d.rev || 0, pendente: true });
          await enviar();
        } else {
          gravarMeta({ uid: user.uid, rev: d.rev || 0, pendente: false });
          if (usar === "nuvem") {
            if (perguntou) await guardarCopia(local, "navegador");
            if (App.aplicarRemoto(d.json) && App.temDados()) App.toast("Escala de Itaberaba carregada.");
          }
          status("salvo", { salvoEm: ms(d.atualizadoEm) });
        }
      }
      abrirComoMestre(user);
      limparVersoesAntigas();
    } catch (e) {
      console.error("Falha na sincronização inicial:", e);
      if (usuario === user) { definir({ acesso: { estado: "erro", detalhe: mensagemErro(e) } }); status("erro", { detalhe: mensagemErro(e) }); }
    } finally {
      iniciando = false;
      if (docAtrasado !== undefined && usuario === user && sincronizado) { const x = docAtrasado; docAtrasado = undefined; processarRemoto(x); }
    }
  }

  // Primeiro acesso: mostra na tela de acesso as fontes disponíveis e espera o administrador escolher.
  async function primeiroAcesso(user) {
    const resumo = json => { try { const s = JSON.parse(json); return { peritos: (s.peritos || []).length, meses: Object.keys(s.extra || {}).length }; } catch (e) { return null; } };
    const fontes = { local: App.temDados() ? resumo(App.obterJSON()) : null, legado: null };
    try { // dados da versão 2 (uma escala por usuário), se existirem
      const l = await fs.getDoc(fs.doc(db, "escalas", user.uid));
      if (l.exists() && typeof l.data().json === "string") { legadoJson = l.data().json; fontes.legado = resumo(legadoJson); }
    } catch (e) { /* sem permissão ou inexistente: segue sem essa opção */ }
    if (usuario !== user) return;
    definir({ acesso: { estado: "primeiro-acesso", fontes }, status: "sincronizando" });
    await new Promise(resolve => { primeiroAcessoResolver = resolve; });
  }

  async function perguntar(d) {
    const quando = d.atualizadoEm && d.atualizadoEm.toDate ? d.atualizadoEm.toDate().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
    const r = await App.dialogo({
      titulo: "Qual escala manter?",
      html: "<p>A escala de Itaberaba na nuvem" + (quando ? " (atualizada em <b>" + quando + "</b>)" : "") + " é diferente da que está neste navegador.</p>" +
            "<p>Escolha qual usar. A outra fica guardada em <b>Configurações › Versões salvas</b>, caso precise recuperar.</p>",
      botoes: [
        { id: "nuvem", rotulo: "Usar a escala da nuvem", estilo: "solid" },
        { id: "local", rotulo: "Usar a deste navegador (substitui a da nuvem)" }
      ],
      coluna: true
    });
    return r || "nuvem";
  }

  async function limparVersoesAntigas() {
    if (limpezaFeita || papelAtual !== "mestre") return;
    limpezaFeita = true;
    try {
      const velhas = await fs.getDocs(fs.query(refHist, fs.where(fs.documentId(), "<", diaISO(DIAS_VERSOES))));
      await Promise.all(velhas.docs.map(x => fs.deleteDoc(x.ref)));
    } catch (e) { console.warn("Limpeza de versões antigas falhou:", e); }
  }

  // ---------- Administrador: pedidos de acesso e propostas recebidas ----------
  function escutarAcessosDoMestre(user) {
    let primeira = true;
    desmontagens.push(fs.onSnapshot(refAcessos, snap => {
      if (usuario !== user) return;
      if (!primeira) snap.docChanges().forEach(ch => {
        const v = ch.doc.data();
        if (ch.type === "added" && v.status === "pendente") App.toast("Novo pedido de acesso: " + (v.nome || v.email));
      });
      primeira = false;
      definir({ acessos: snap.docs.map(docParaObj), acessosCarregados: true });
    }, e => console.error("Falha ao ler os acessos:", e)));
  }
  function escutarPropostasDoMestre(user) {
    const q = fs.query(refProps, fs.orderBy("atualizadoEm", "desc"), fs.limit(100));
    let primeira = true, anterior = {};
    desmontagens.push(fs.onSnapshot(q, snap => {
      if (usuario !== user) return;
      const lista = snap.docs.map(docParaObj);
      if (!primeira) lista.forEach(p => {
        const antes = anterior[p.id];
        if (p.status === "enviada" && (!antes || antes.status !== "enviada")) App.toast("Nova proposta de " + (p.autorNome || p.autorEmail) + " para " + NOME_MES(p.mes) + ".");
      });
      primeira = false; anterior = {}; lista.forEach(p => { anterior[p.id] = p; });
      definir({ propostas: lista, propostasCarregadas: true });
      lista.forEach(p => App.atualizarPropostaAberta(p));
    }, e => console.error("Falha ao ler as propostas:", e)));
  }

  // =====================================================================
  //  Quem não é administrador: acesso (pedido/autorização) e visualização
  // =====================================================================
  function iniciarAcesso(user) {
    const refAcesso = fs.doc(refAcessos, email);
    let abrindo = null;
    pararAcesso = fs.onSnapshot(refAcesso, snap => {
      if (usuario !== user) return;
      if (snap.metadata.fromCache && !snap.exists()) { // sem resposta do servidor ainda
        if (!navigator.onLine) abrirOffline("Sem conexão com a internet.");
        return;
      }
      const d = snap.exists() ? snap.data() : null;
      if (!d) { abrindo = null; encerrarVisualizador("sem-acesso"); return; }
      if (d.status === "pendente") { abrindo = null; encerrarVisualizador("pendente", { solicitadoEm: ms(d.solicitadoEm) }); return; }
      if (d.status === "negado") { abrindo = null; encerrarVisualizador("negado"); return; }
      if (d.status === "autorizado") {
        const papel = d.papel === "colaborador" ? "colaborador" : "leitor";
        if (abrindo === papel) return;
        abrindo = papel;
        abrirVisualizador(user, papel);
      }
    }, e => {
      console.error("Falha ao ler o acesso:", e);
      if (usuario === user) definir({ acesso: { estado: "erro", detalhe: mensagemErro(e) } });
    });
    armarEsperaAbertura();
  }

  async function abrirVisualizador(user, papel) {
    // encerra o que a abertura anterior possa ter deixado (troca de papel); o ouvinte do pedido de acesso continua
    desmontagens.forEach(f => { try { f(); } catch (e) { /* ok */ } });
    desmontagens = [];
    clearTimeout(timerProp); timerProp = null; propPendente = null; ultimoJsonDef = null;
    papelAtual = papel;
    await App.entrarModo(papel, { uid: user.uid });
    if (usuario !== user || papelAtual !== papel) return;
    App.sessao.gravar({ uid: user.uid, email, nome: user.displayName || "", papel });
    clearTimeout(esperaAbertura);
    definir({ acesso: { estado: "ativo", papel }, status: "sincronizando", detalhe: "" });
    desmontagens.push(fs.onSnapshot(refUnidade, { includeMetadataChanges: true }, snap => {
      if (usuario !== user) return;
      if (snap.metadata.fromCache && !snap.exists()) { if (!navigator.onLine) status("offline", { detalhe: "Sem internet — mostrando a última cópia salva neste aparelho." }); return; }
      const d = snap.exists() ? snap.data() : null;
      const json = d && typeof d.json === "string" ? d.json : null;
      if (json !== ultimoJsonDef) { ultimoJsonDef = json; App.aplicarDefinitiva(json); }
      if (snap.metadata.fromCache && !navigator.onLine) status("offline", { detalhe: "Sem internet — mostrando a última cópia salva neste aparelho." });
      else status("atualizado", { salvoEm: d ? ms(d.atualizadoEm) : null, detalhe: json ? "" : "O administrador ainda não publicou a escala de Itaberaba." });
    }, e => {
      console.error("Falha ao ler a escala:", e);
      if (e && e.code === "permission-denied") { encerrarVisualizador("sem-acesso"); return; } // acesso retirado: o ouvinte do pedido confirma o novo estado
      if (usuario === user) status("erro", { detalhe: mensagemErro(e) });
    }));
    if (papel === "colaborador") desmontagens.push(escutarMinhasPropostas(user));
  }

  function escutarMinhasPropostas(user) {
    const q = fs.query(refProps, fs.where("autorUid", "==", user.uid));
    let primeira = true, anterior = {};
    return fs.onSnapshot(q, snap => {
      if (usuario !== user) return;
      const lista = snap.docs.map(docParaObj).sort((a, b) => (b.atualizadoEm || 0) - (a.atualizadoEm || 0));
      if (!primeira) lista.forEach(p => {
        const antes = anterior[p.id];
        if (antes && antes.status !== p.status && (p.status === "aprovada" || p.status === "rejeitada"))
          App.toast("Sua proposta de " + NOME_MES(p.mes) + " foi " + (p.status === "aprovada" ? "aprovada" : "rejeitada") + " pelo administrador.");
      });
      primeira = false; anterior = {}; lista.forEach(p => { anterior[p.id] = p; });
      definir({ propostas: lista, propostasCarregadas: true });
      lista.forEach(p => App.atualizarPropostaAberta(p));
    }, e => console.error("Falha ao ler as propostas:", e));
  }

  // ---------- Colaborador: salvar a proposta que está sendo editada ----------
  App.aoMudarProposta(p => {
    if (papelAtual !== "colaborador" || !usuario || !p) return;
    propPendente = p.id;
    clearTimeout(timerProp); timerProp = setTimeout(() => { salvarProposta().catch(() => {}); }, ESPERA_GRAVACAO_MS);
    if (navigator.onLine) status("salvando"); else status("offline", { detalhe: "Sem internet — a proposta será salva quando a conexão voltar." });
  });
  async function salvarProposta() {
    clearTimeout(timerProp); timerProp = null;
    const p = App.estado.prop;
    if (!p || p.id !== propPendente || !usuario) return;
    try {
      await fs.updateDoc(fs.doc(refProps, p.id), {
        dias: JSON.stringify(p.dias),
        equipes: JSON.stringify(p.equipes.map(e => ({ id: e.id, membros: e.membros, cor: e.cor }))),
        observacao: String(p.observacao || "").slice(0, 2000),
        atualizadoEm: fs.serverTimestamp(), dispositivo
      });
      if (!timerProp) propPendente = null;
      status("salvo", { salvoEm: Date.now() });
    } catch (e) {
      console.error("Falha ao salvar a proposta:", e);
      status("erro", { detalhe: mensagemErro(e) });
      throw e;
    }
  }

  // ---------- Login / saída ----------
  fbAuth.onAuthStateChanged(auth, user => {
    desmontar();
    if (!user) {
      usuario = null; email = "";
      if (App.estado.papel) App.sairModo({ apagarCache: true });
      App.sessao.limpar();
      definir({ usuario: null, acesso: { estado: "deslogado" }, status: "desconectado", salvoEm: null, detalhe: "" });
      return;
    }
    usuario = user; email = (user.email || "").toLowerCase();
    definir({ usuario: { nome: user.displayName || "", email: user.email || "", foto: user.photoURL || "", uid: user.uid }, acesso: { estado: "verificando" }, status: "sincronizando", detalhe: "" });
    if (MESTRE && email === MESTRE) iniciarMestre(user).catch(e => { console.error(e); definir({ acesso: { estado: "erro", detalhe: mensagemErro(e) } }); });
    else iniciarAcesso(user);
  });

  window.addEventListener("online", () => {
    if (!usuario) return;
    if (papelAtual === "mestre" && sincronizado) { if (meta().pendente) agendar(); else status("salvo"); }
    else if (papelAtual) status("atualizado");
  });
  window.addEventListener("offline", () => { if (usuario && papelAtual) status("offline", { detalhe: "Sem internet — as alterações ficam neste aparelho e serão enviadas quando a conexão voltar." }); });
  window.addEventListener("beforeunload", e => {
    if (!usuario || !(timer || gravando || timerProp)) return;
    if (timer) enviar().catch(() => {});
    if (timerProp) salvarProposta().catch(() => {});
    e.preventDefault(); e.returnValue = "";
  });

  const exigir = (cond, msg) => { if (!cond) throw new Error(msg); };
  App.nuvem.registrar({
    // Chamado diretamente no clique do botão (sem "await" antes), para o navegador não bloquear a janela do Google.
    entrar({ lembrar }) {
      const prov = new fbAuth.GoogleAuthProvider();
      prov.setCustomParameters({ prompt: "select_account" });
      return fbAuth.signInWithPopup(auth, prov)
        .then(() => fbAuth.setPersistence(auth, lembrar ? fbAuth.indexedDBLocalPersistence : fbAuth.browserSessionPersistence))
        .catch(e => { const msg = mensagemLogin(e); if (msg) App.toast(msg); });
    },
    async sair() {
      if (papelAtual === "mestre" && (timer || gravando)) await Promise.race([esperarGravacao().catch(() => {}), dorme(4000)]);
      if (timerProp) await salvarProposta().catch(() => {});
      await fbAuth.signOut(auth);
    },
    async listarVersoes() {
      exigir(papelAtual === "mestre", "Somente o administrador vê as versões.");
      const snap = await fs.getDocs(fs.query(refHist, fs.where(fs.documentId(), ">=", diaISO(DIAS_LISTA))));
      return snap.docs.map(x => {
        const v = x.data();
        return { id: x.id, json: v.json, rotulo: v.rotulo || "", em: ms(v.salvoEm) };
      }).filter(v => typeof v.json === "string").sort((a, b) => b.id.localeCompare(a.id));
    },

    // --- tela de acesso ---
    async solicitarAcesso() {
      exigir(usuario && papelAtual === null, "Entre com sua conta Google primeiro.");
      await fs.setDoc(fs.doc(refAcessos, email), {
        email, nome: String(usuario.displayName || "").slice(0, 120), foto: String(usuario.photoURL || "").slice(0, 500),
        status: "pendente", uid: usuario.uid, solicitadoEm: fs.serverTimestamp()
      });
    },
    async concluirPrimeiroAcesso({ fonte, dados }) {
      exigir(papelAtual === "mestre" && primeiroAcessoResolver, "O primeiro acesso já foi concluído.");
      if (fonte === "vazio") App.limparDados();
      else if (fonte === "arquivo" && dados) App.substituirDados(dados);
      else if (fonte === "legado" && legadoJson) App.substituirDados(JSON.parse(legadoJson));
      // fonte === "local": o que já está neste navegador sobe como está
      const r = primeiroAcessoResolver; primeiroAcessoResolver = null; r(fonte);
    },

    // --- administrador: pessoas ---
    async decidirAcesso(alvo, { status: st, papel }) {
      exigir(papelAtual === "mestre", "Somente o administrador autoriza pessoas.");
      const dados = { status: st, decididoEm: fs.serverTimestamp(), decididoPor: email };
      if (papel) dados.papel = papel;
      await fs.setDoc(fs.doc(refAcessos, String(alvo).toLowerCase()), dados, { merge: true });
    },
    async preAutorizar(alvo, papel) {
      exigir(papelAtual === "mestre", "Somente o administrador autoriza pessoas.");
      const e = String(alvo).trim().toLowerCase();
      exigir(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e), "E-mail inválido.");
      await fs.setDoc(fs.doc(refAcessos, e), { email: e, nome: "", foto: "", status: "autorizado", papel, decididoEm: fs.serverTimestamp(), decididoPor: email });
    },
    async removerAcesso(alvo) {
      exigir(papelAtual === "mestre", "Somente o administrador remove acessos.");
      await fs.deleteDoc(fs.doc(refAcessos, String(alvo).toLowerCase()));
    },

    // --- propostas ---
    async criarProposta({ mes, dias, equipes, observacao }) {
      exigir(papelAtual === "colaborador", "Só colaboradores criam propostas.");
      const ref = fs.doc(refProps);
      const dados = {
        mes, autorUid: usuario.uid, autorEmail: email, autorNome: String(usuario.displayName || "").slice(0, 120), status: "rascunho",
        dias: String(dias || "{}"), equipes: String(equipes || "[]"), observacao: String(observacao || "").slice(0, 2000), dispositivo
      };
      await fs.setDoc(ref, Object.assign({}, dados, { criadoEm: fs.serverTimestamp(), atualizadoEm: fs.serverTimestamp() }));
      return Object.assign({ id: ref.id, criadoEm: Date.now(), atualizadoEm: Date.now() }, dados);
    },
    async enviarProposta(id) {
      exigir(papelAtual === "colaborador", "Só o autor envia a proposta.");
      if (timerProp || propPendente === id) await salvarProposta();
      await fs.updateDoc(fs.doc(refProps, id), { status: "enviada", enviadoEm: fs.serverTimestamp(), atualizadoEm: fs.serverTimestamp(), dispositivo });
    },
    async retirarProposta(id) { // enviada/rejeitada → rascunho (o conteúdo não muda)
      exigir(papelAtual === "colaborador", "Só o autor altera a proposta.");
      await fs.updateDoc(fs.doc(refProps, id), { status: "rascunho", atualizadoEm: fs.serverTimestamp(), dispositivo });
    },
    async excluirProposta(id) {
      exigir(papelAtual === "colaborador" || papelAtual === "mestre", "Sem permissão.");
      await fs.deleteDoc(fs.doc(refProps, id));
    },
    async decidirProposta(id, { status: st, motivo }) {
      exigir(papelAtual === "mestre", "Somente o administrador decide propostas.");
      exigir(st === "aprovada" || st === "rejeitada", "Decisão inválida.");
      if (st === "aprovada") await esperarGravacao(); // a escala definitiva precisa estar salva antes de marcar a proposta como aprovada
      const dados = { status: st, decididoEm: fs.serverTimestamp(), decididoPor: email, atualizadoEm: fs.serverTimestamp() };
      if (motivo) dados.motivo = String(motivo).slice(0, 1000);
      await fs.updateDoc(fs.doc(refProps, id), dados);
    }
  });
}
