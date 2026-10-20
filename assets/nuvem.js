// Sincronização na nuvem: login com Google (Firebase Authentication) + dados no Cloud Firestore.
// Só é ativada quando config.js traz a configuração do Firebase; sem ela o app funciona só no navegador.
//
// Modelo no Firestore (um documento por usuário, protegido pelas regras em firestore.rules):
//   escalas/{uid}                    → { json, rev, versao, atualizadoEm, dispositivo, email }
//   escalas/{uid}/historico/{id}     → { json, rev, salvoEm, rotulo? }   (uma versão por dia + cópias de segurança)

const SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
const App = window.EscalaApp;
const CFG = window.ESCALA_CONFIG || {};
const ESPERA_GRAVACAO_MS = 1200;  // agrupa cliques seguidos em uma única gravação
const DIAS_VERSOES = 60;          // versões mais antigas que isso são apagadas
const DIAS_LISTA = 30;            // versões mostradas em Configurações

function pad2(n){ return n < 10 ? "0" + n : "" + n; }
function hojeISO(){ const d = new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function diaISO(diasAtras){ const d = new Date(Date.now() - diasAtras * 86400000); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
function carimbo(){ const d = new Date(); return hojeISO() + "_" + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()); }

if (App) {
  if (!CFG.firebase || !CFG.firebase.apiKey) {
    App.pronto.then(() => App.nuvem.definir({ disponivel: false, status: "local" }));
  } else if (location.protocol === "file:") {
    App.pronto.then(() => App.nuvem.definir({ disponivel: false, status: "local", detalhe: "O login com Google só funciona com o app publicado (endereço https), não abrindo o arquivo direto do computador." }));
  } else {
    carregar();
  }
}

function carregar(){
  iniciar().catch(err => {
    console.error("Falha ao iniciar a nuvem:", err);
    App.pronto.then(() => App.nuvem.definir({ disponivel: false, status: "erro", detalhe: "Não foi possível carregar o serviço de login. Verifique a internet — os dados continuam salvos neste navegador." }));
    window.addEventListener("online", carregar, { once: true });
  });
}

async function iniciar(){
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
  const permitidos = (Array.isArray(CFG.emailsPermitidos) ? CFG.emailsPermitidos : []).map(e => String(e).trim().toLowerCase()).filter(Boolean);
  const dispositivo = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  let usuario = null;          // usuário Firebase conectado
  let ref = null;              // documento escalas/{uid}
  let pararEscuta = null;
  let sincronizado = false;    // já comparou nuvem × navegador após o login?
  let iniciando = false;
  let docAtrasado = undefined; // documento que chegou durante a comparação inicial
  let timer = null, gravando = false, reenviar = false;
  let ultimaRev = 0;           // rev da última gravação feita por este dispositivo (para ignorar o "eco")
  let limpezaFeita = false;

  const definir = (status, extra) => App.nuvem.definir(Object.assign({ status, detalhe: "" }, extra || {}));
  const meta = () => App.sync.ler();
  const gravarMeta = m => App.sync.gravar(m);

  function mensagemErro(e){
    const c = (e && e.code) || "";
    if (c === "permission-denied") return "Sem permissão no Firestore: confira as regras de segurança e se o seu e-mail está na lista autorizada.";
    if (c === "unavailable") return "Servidor indisponível ou sem internet. As alterações continuam neste navegador e serão enviadas depois.";
    if (c === "resource-exhausted") return "Limite gratuito diário do Firebase atingido. Tente novamente amanhã.";
    if (c === "unauthenticated") return "Sessão expirada. Entre novamente.";
    return "Erro ao salvar na nuvem" + (c ? " (" + c + ")" : "") + ".";
  }
  function mensagemLogin(e){
    const c = (e && e.code) || "";
    if (c === "auth/popup-closed-by-user" || c === "auth/cancelled-popup-request" || c === "auth/user-cancelled") return null;
    if (c === "auth/popup-blocked") return "O navegador bloqueou a janela de login. Permita pop-ups para este site e tente de novo.";
    if (c === "auth/unauthorized-domain") return "Este endereço não está autorizado no Firebase (Authentication › Configurações › Domínios autorizados).";
    if (c === "auth/operation-not-allowed") return "O login com Google não está ativado no projeto Firebase.";
    if (c === "auth/network-request-failed") return "Sem conexão com a internet.";
    return "Não foi possível entrar" + (c ? " (" + c + ")" : "") + ".";
  }

  // ---------- Gravação (navegador → nuvem) ----------
  App.aoMudar((json, origem) => { if (origem !== "nuvem") agendar(); });

  function agendar(){
    if (!usuario || !sincronizado) return;
    clearTimeout(timer);
    timer = setTimeout(enviar, ESPERA_GRAVACAO_MS);
    if (navigator.onLine) definir("salvando");
    else definir("offline", { detalhe: "Sem internet — as alterações ficam neste navegador e serão enviadas quando a conexão voltar." });
  }

  async function enviar(){
    clearTimeout(timer); timer = null;
    if (!usuario || !sincronizado) return;
    if (gravando) { reenviar = true; return; }
    gravando = true;
    const u = usuario, docRef = ref, json = App.obterJSON();
    const m = meta(), revAnterior = (m.uid === u.uid && m.rev) || 0, rev = revAnterior + 1;
    gravarMeta({ uid: u.uid, rev, pendente: true });
    ultimaRev = rev;
    try {
      await Promise.all([
        fs.setDoc(docRef, { json, rev, versao: 3, atualizadoEm: fs.serverTimestamp(), dispositivo, email: u.email || "" }),
        fs.setDoc(fs.doc(docRef, "historico", hojeISO()), { json, rev, salvoEm: fs.serverTimestamp() }).catch(e => console.warn("Versão diária não gravada:", e))
      ]);
      if (usuario !== u) return;
      if (!timer && !reenviar && App.obterJSON() === json) { const mm = meta(); mm.pendente = false; gravarMeta(mm); }
      definir("salvo", { salvoEm: Date.now() });
    } catch (e) {
      console.error("Falha ao gravar na nuvem:", e);
      const mm = meta(); if (mm.rev === rev) { mm.rev = revAnterior; gravarMeta(mm); }
      if (usuario === u) definir("erro", { detalhe: mensagemErro(e) });
    } finally {
      gravando = false;
      if (reenviar && usuario === u) { reenviar = false; agendar(); }
    }
  }

  // Guarda no histórico uma versão que vai ser substituída (para poder recuperar depois).
  function guardarCopia(json, rotulo){
    if (!ref || !json) return Promise.resolve();
    return fs.setDoc(fs.doc(ref, "historico", carimbo() + "_" + (rotulo === "conta" ? "conta" : "navegador")),
      { json, rev: 0, salvoEm: fs.serverTimestamp(), rotulo: rotulo === "conta" ? "versão da conta substituída" : "cópia do navegador substituída" })
      .catch(e => console.warn("Cópia de segurança não gravada:", e));
  }

  // ---------- Leitura (nuvem → navegador) ----------
  function escutar(u){
    sincronizado = false; iniciando = false; docAtrasado = undefined;
    ref = fs.doc(db, "escalas", u.uid);
    definir("sincronizando");
    pararEscuta = fs.onSnapshot(ref, { includeMetadataChanges: true }, snap => {
      if (usuario !== u) return;
      if (snap.metadata.fromCache) { // ainda sem resposta do servidor: nunca decidir com base no cache
        if (!sincronizado) definir(navigator.onLine ? "sincronizando" : "offline", navigator.onLine ? {} : { detalhe: "Sem internet — usando a cópia deste navegador." });
        return;
      }
      if (snap.metadata.hasPendingWrites) return;
      const d = snap.exists() ? snap.data() : null;
      if (iniciando) { docAtrasado = d; return; }
      if (!sincronizado) { sincronizacaoInicial(u, d); return; }
      processarRemoto(d);
    }, e => {
      console.error("Falha ao ler da nuvem:", e);
      if (usuario !== u) return;
      definir("erro", { detalhe: mensagemErro(e) });
      if (e.code === "permission-denied") App.toast("Sua conta não tem permissão para usar a nuvem desta escala. Os dados seguem só neste navegador.");
    });
  }

  function processarRemoto(d){
    if (!d || typeof d.json !== "string") return;
    if (d.dispositivo === dispositivo && d.rev === ultimaRev) return; // eco da própria gravação
    const m = meta();
    if (timer || gravando) {
      // alteração simultânea em outro dispositivo: a deste dispositivo será gravada por último e prevalece
      gravarMeta({ uid: usuario.uid, rev: Math.max(m.rev || 0, d.rev || 0), pendente: true });
      if (App.canonico(d.json) !== App.obterJSON()) App.toast("Houve alteração em outro dispositivo ao mesmo tempo. A versão deste dispositivo foi mantida.");
      reenviar = true;
      return;
    }
    gravarMeta({ uid: usuario.uid, rev: d.rev || 0, pendente: false });
    if (App.aplicarRemoto(d.json)) App.toast("Escala atualizada com alterações feitas em outro dispositivo.");
    definir("salvo", { salvoEm: d.atualizadoEm && d.atualizadoEm.toMillis ? d.atualizadoEm.toMillis() : Date.now() });
  }

  async function sincronizacaoInicial(u, d){
    iniciando = true;
    try {
      const m = meta(), mesmoUsuario = m.uid === u.uid, local = App.obterJSON();
      if (!d || typeof d.json !== "string") {
        // primeira vez nesta conta: envia o que há neste navegador
        sincronizado = true;
        gravarMeta({ uid: u.uid, rev: 0, pendente: true });
        await enviar();
        if (App.temDados()) App.toast("Pronto! Os dados deste navegador foram salvos na sua conta.");
      } else {
        let usar, perguntou = false;
        if (App.canonico(d.json) === local) usar = "igual";
        else if (mesmoUsuario && !m.pendente) usar = "nuvem";                    // nada novo aqui: vale a nuvem
        else if (mesmoUsuario && m.pendente && d.rev === m.rev) usar = "local";  // editado offline sobre a última versão
        else if (!App.temDados()) usar = "nuvem";
        else { usar = await perguntar(d); perguntou = true; }
        if (usuario !== u) return;
        sincronizado = true;
        if (usar === "local") {
          if (perguntou) await guardarCopia(d.json, "conta");
          gravarMeta({ uid: u.uid, rev: d.rev || 0, pendente: true });
          await enviar();
        } else {
          gravarMeta({ uid: u.uid, rev: d.rev || 0, pendente: false });
          if (usar === "nuvem") {
            if (perguntou) await guardarCopia(local, "navegador");
            if (App.aplicarRemoto(d.json) && App.temDados()) App.toast("Escala da sua conta carregada.");
          }
          definir("salvo", { salvoEm: d.atualizadoEm && d.atualizadoEm.toMillis ? d.atualizadoEm.toMillis() : null });
        }
      }
      limparVersoesAntigas();
    } catch (e) {
      console.error("Falha na sincronização inicial:", e);
      if (usuario === u) definir("erro", { detalhe: mensagemErro(e) });
    } finally {
      iniciando = false;
      if (docAtrasado !== undefined && usuario === u && sincronizado) { const x = docAtrasado; docAtrasado = undefined; processarRemoto(x); }
    }
  }

  async function perguntar(d){
    const quando = d.atualizadoEm && d.atualizadoEm.toDate ? d.atualizadoEm.toDate().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
    const r = await App.dialogo({
      titulo: "Qual escala manter?",
      html: "<p>Sua conta já tem uma escala salva" + (quando ? " (atualizada em <b>" + quando + "</b>)" : "") + ", diferente da que está neste navegador.</p>" +
            "<p>Escolha qual usar. A outra fica guardada em <b>Configurações › Versões salvas</b>, caso precise recuperar.</p>",
      botoes: [
        { id: "nuvem", rotulo: "Usar a escala da minha conta", estilo: "solid" },
        { id: "local", rotulo: "Usar a deste navegador (substitui a da conta)" }
      ],
      coluna: true
    });
    return r || "nuvem";
  }

  async function limparVersoesAntigas(){
    if (limpezaFeita || !ref) return;
    limpezaFeita = true;
    try {
      const velhas = await fs.getDocs(fs.query(fs.collection(ref, "historico"), fs.where(fs.documentId(), "<", diaISO(DIAS_VERSOES))));
      await Promise.all(velhas.docs.map(x => fs.deleteDoc(x.ref)));
    } catch (e) { console.warn("Limpeza de versões antigas falhou:", e); }
  }

  // ---------- Login ----------
  fbAuth.onAuthStateChanged(auth, user => {
    if (pararEscuta) { pararEscuta(); pararEscuta = null; }
    clearTimeout(timer); timer = null; reenviar = false;
    sincronizado = false; limpezaFeita = false; ref = null;
    if (!user) { usuario = null; definir("desconectado", { disponivel: true, usuario: null, salvoEm: null }); return; }
    const email = (user.email || "").toLowerCase();
    if (permitidos.length && !permitidos.includes(email)) {
      usuario = null;
      fbAuth.signOut(auth);
      App.dialogo({ titulo: "Conta sem acesso", html: "<p>A conta <b>" + email.replace(/[<>&"]/g, "") + "</b> não está autorizada a usar a nuvem desta escala.</p><p>Entre com outra conta ou peça ao responsável para incluir seu e-mail.</p>" });
      return;
    }
    usuario = user;
    App.nuvem.definir({ disponivel: true, usuario: { nome: user.displayName || "", email: user.email || "", foto: user.photoURL || "" } });
    escutar(user);
  });

  window.addEventListener("online", () => { if (usuario && sincronizado) { if (meta().pendente) agendar(); else definir("salvo"); } });
  window.addEventListener("offline", () => { if (usuario) definir("offline", { detalhe: "Sem internet — as alterações ficam neste navegador e serão enviadas quando a conexão voltar." }); });
  window.addEventListener("beforeunload", e => {
    if (!usuario || !(timer || gravando)) return;
    if (timer) enviar();
    e.preventDefault(); e.returnValue = "";
  });

  App.nuvem.registrar({
    // Chamado diretamente no clique do botão (sem "await" antes), para o navegador não bloquear a janela do Google.
    entrar({ lembrar }){
      const prov = new fbAuth.GoogleAuthProvider();
      prov.setCustomParameters({ prompt: "select_account" });
      return fbAuth.signInWithPopup(auth, prov)
        .then(() => fbAuth.setPersistence(auth, lembrar ? fbAuth.indexedDBLocalPersistence : fbAuth.browserSessionPersistence))
        .catch(e => { const msg = mensagemLogin(e); if (msg) App.toast(msg); });
    },
    async sair(){
      if (timer) await Promise.race([enviar(), new Promise(r => setTimeout(r, 4000))]);
      await fbAuth.signOut(auth);
    },
    async listarVersoes(){
      if (!ref) return [];
      const snap = await fs.getDocs(fs.query(fs.collection(ref, "historico"), fs.where(fs.documentId(), ">=", diaISO(DIAS_LISTA))));
      return snap.docs.map(x => {
        const v = x.data();
        return { id: x.id, json: v.json, rotulo: v.rotulo || "", em: v.salvoEm && v.salvoEm.toMillis ? v.salvoEm.toMillis() : null };
      }).filter(v => typeof v.json === "string").sort((a, b) => b.id.localeCompare(a.id));
    }
  });
  App.nuvem.definir({ status: "sincronizando" }); // até o Firebase dizer se já há sessão salva
}
