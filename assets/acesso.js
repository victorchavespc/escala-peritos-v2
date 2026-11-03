// Tela de acesso, aba Propostas/Aprovações e barra da proposta (extraoficial).
// Os dados chegam de nuvem.js (Nuvem.info); as regras de negócio ficam em app.js. Tudo o que vem de outras pessoas
// (nome, e-mail, observações, motivos) é escapado antes de aparecer na tela.
(function(){
  "use strict";
  const App = window.EscalaApp; if(!App) return;
  const N = App.nuvem, U = App.util, E = App.estado, esc = U.escapar;
  const $ = id => document.getElementById(id);
  const raiz = document.documentElement;
  const GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  const nomeMes = chave => { const m = /^(\d{4})-(\d{1,2})$/.exec(chave || ""); return m ? U.nomeMesAno(+m[1], +m[2]) : "o mês"; };
  const dataHora = ms => ms ? new Date(ms).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
  const chaveAtual = () => E.ano + "-" + E.mes;
  const nomeDe = p => p.nome || p.email || "—";
  const erroAmigavel = e => {
    const c = e && e.code;
    if (c === "permission-denied") return "Sem permissão para essa ação.";
    if (c === "unavailable") return "Sem conexão com a nuvem. Tente de novo.";
    return (e && e.message && !/^(Firebase|\d+ )/.test(e.message)) ? e.message : "Não foi possível concluir. Tente de novo.";
  };
  async function tentar(fn){
    if(!N.api){ App.toast("A conexão com a nuvem ainda está carregando. Tente em instantes."); return false; }
    try{ await fn(); return true; }catch(e){ console.error(e); App.toast(erroAmigavel(e)); return false; }
  }

  // =====================================================================
  //  Tela de acesso
  // =====================================================================
  const corpoGate = $("gateCorpo");
  let assinaturaGate = "", previaArquivo = null, ocupado = false;

  function renderGate(info){
    if(!App.nuvemAtiva) return;
    const a = info.acesso || {}, u = info.usuario;
    raiz.classList.toggle("gated", a.estado !== "ativo");
    if(a.estado === "ativo") { assinaturaGate = ""; return; }
    $("gateUnidade").textContent = U.UNIDADE;
    const sig = [a.estado, a.detalhe || "", u && u.email, a.solicitadoEm || "", JSON.stringify(a.fontes || null), previaArquivo ? previaArquivo.nome : "", ocupado].join("|");
    if(sig === assinaturaGate) return;
    assinaturaGate = sig;

    const pessoa = u ? '<div class="gate-pessoa"><span class="avatar-btn">' + U.avatarHtml(u) + '</span><div><div class="gn">' + esc(nomeDe(u)) + '</div><div class="ge">' + esc(u.email) + '</div></div></div>' : "";
    const sair = u ? '<button class="btn-sm" data-g="sair">Sair e usar outra conta</button>' : "";
    let h;
    switch(a.estado){
      case "deslogado":
        h = '<h2 id="gateTitulo">Acesso restrito</h2>' +
          '<p>A escala de plantões de <b>' + esc(U.UNIDADE) + '</b> é restrita aos peritos autorizados. Entre com sua conta Google para continuar.</p>' +
          '<button class="btn-google grande" data-g="entrar">' + GOOGLE + '<span>Entrar com Google</span></button>' +
          '<label class="chk"><input type="checkbox" id="gateLembrar" checked><span>Manter conectado neste aparelho<small>Desmarque em computador compartilhado — a sessão termina ao fechar a aba.</small></span></label>' +
          '<div class="gate-rodape">Na primeira vez, o administrador precisa liberar o seu acesso. Nome, e-mail e foto da sua conta Google são usados apenas para identificar você aqui.</div>';
        break;
      case "sem-acesso":
        h = '<h2 id="gateTitulo">Falta pouco</h2>' + pessoa +
          '<p>Sua conta ainda <b>não tem acesso</b> à escala de ' + esc(U.UNIDADE) + '. Envie um pedido ao administrador — você será avisado nesta tela assim que ele autorizar.</p>' +
          '<div class="gate-acoes"><button class="btn-sm solid" data-g="solicitar"' + (ocupado ? " disabled" : "") + '>' + (ocupado ? "Enviando…" : "Solicitar acesso") + '</button>' + sair + '</div>';
        break;
      case "pendente":
        h = '<h2 id="gateTitulo">Pedido enviado</h2>' + pessoa +
          '<p>O administrador precisa autorizar o seu acesso' + (a.solicitadoEm ? ' (pedido de <b>' + esc(dataHora(a.solicitadoEm)) + '</b>)' : '') + '. Esta tela atualiza sozinha quando isso acontecer — não precisa recarregar.</p>' +
          '<div class="gate-acoes">' + sair + '</div>';
        break;
      case "negado":
        h = '<h2 id="gateTitulo">Acesso não autorizado</h2>' + pessoa +
          '<p>O administrador não autorizou esta conta a ver a escala de ' + esc(U.UNIDADE) + '. Se isso for um engano, fale com ele ou entre com outra conta.</p>' +
          '<div class="gate-acoes">' + sair + '</div>';
        break;
      case "primeiro-acesso": {
        const f = a.fontes || {};
        const res = r => r ? plural2(r.peritos, "perito") + " · " + plural2(r.meses, "mês", "meses") + " lançados" : "";
        if(previaArquivo){
          const r = previaArquivo.resumo;
          h = '<h2 id="gateTitulo">Importar histórico</h2><p>Confira o que está no arquivo antes de importar:</p>' +
            '<div class="gate-prev"><b>' + esc(previaArquivo.nome) + '</b><small>' + plural2(r.peritos, "perito") + ' · ' + plural2(r.equipes, "equipe") + ' · escalas de ' + plural2(r.meses, "mês", "meses") + ' (' + plural2(r.fechados, "fechado") + ')</small></div>' +
            '<p class="hint">Isso vira a escala definitiva de ' + esc(U.UNIDADE) + ' na nuvem. Você pode ajustar tudo depois.</p>' +
            '<div class="gate-acoes"><button class="btn-sm solid" data-g="importar-ok"' + (ocupado ? " disabled" : "") + '>' + (ocupado ? "Importando…" : "Importar este arquivo") + '</button><button class="btn-sm" data-g="fonte-arquivo">Escolher outro</button><button class="btn-sm" data-g="previa-voltar">Voltar</button></div>';
        }else{
          h = '<h2 id="gateTitulo">Primeiro acesso do administrador</h2>' +
            '<p>A escala de <b>' + esc(U.UNIDADE) + '</b> ainda está <b>vazia na nuvem</b>. Como você quer começar? Depois você pode importar outro arquivo em <b>Configurações</b>.</p><div class="gate-opcoes">' +
            (f.local ? '<button class="gate-op primaria" data-g="fonte-local"><strong>Usar os dados deste navegador</strong><span>' + res(f.local) + '</span></button>' : '') +
            (f.legado ? '<button class="gate-op" data-g="fonte-legado"><strong>Usar os dados da versão 2 (sua conta)</strong><span>' + res(f.legado) + '</span></button>' : '') +
            '<button class="gate-op' + (f.local || f.legado ? '' : ' primaria') + '" data-g="fonte-arquivo"><strong>Importar o histórico de um arquivo (.json)</strong><span>Backup exportado pela versão anterior do programa</span></button>' +
            '<button class="gate-op" data-g="fonte-vazio"><strong>Começar do zero</strong><span>Cadastrar os peritos e montar tudo novamente</span></button></div>' +
            '<input type="file" id="gateArquivo" accept="application/json,.json" hidden>';
        }
        break;
      }
      case "erro":
        h = '<h2 id="gateTitulo">Não foi possível continuar</h2>' + pessoa + '<p>' + esc(a.detalhe || "Algo deu errado ao falar com a nuvem.") + '</p>' +
          '<div class="gate-acoes"><button class="btn-sm solid" data-g="recarregar">Tentar de novo</button>' + sair + '</div>';
        break;
      default: // conectando / verificando
        h = '<div class="spin" role="status" aria-label="Carregando"></div><h2 id="gateTitulo">' + (a.estado === "verificando" ? "Verificando seu acesso…" : "Conectando…") + '</h2>' + pessoa + '<p>Só um instante.</p>' + (u ? '<div class="gate-acoes">' + sair + '</div>' : '');
    }
    corpoGate.innerHTML = h;
    const arq = $("gateArquivo");
    if(arq) arq.addEventListener("change", () => {
      const f = arq.files[0]; arq.value = ""; if(!f) return;
      App.lerBackup(f).then(r => { previaArquivo = { nome: f.name, dados: r.dados, resumo: r.resumo }; assinaturaGate = ""; renderGate(N.info); })
        .catch(err => App.toast(err.message));
    });
  }
  const plural2 = (n, s, p) => U.plural(n, s, p);

  corpoGate.addEventListener("click", async ev => {
    const b = ev.target.closest("[data-g]"); if(!b) return;
    const acao = b.dataset.g;
    if(acao === "entrar"){ // precisa ser chamado direto no clique (sem await antes), senão o navegador bloqueia a janela do Google
      if(!N.api){ App.toast("O login ainda está carregando. Tente em instantes."); return; }
      N.api.entrar({ lembrar: $("gateLembrar").checked });
    }
    else if(acao === "sair"){ tentar(() => N.api.sair()); }
    else if(acao === "recarregar"){ location.reload(); }
    else if(acao === "solicitar"){ ocupado = true; renderGate(N.info); await tentar(() => N.api.solicitarAcesso()); ocupado = false; renderGate(N.info); }
    else if(acao === "fonte-arquivo"){ const arq = $("gateArquivo"); if(arq) arq.click(); else { previaArquivo = null; assinaturaGate = ""; renderGate(N.info); setTimeout(() => { const x = $("gateArquivo"); if(x) x.click(); }, 0); } }
    else if(acao === "previa-voltar"){ previaArquivo = null; assinaturaGate = ""; renderGate(N.info); }
    else if(acao === "importar-ok"){ ocupado = true; renderGate(N.info); const ok = await tentar(() => N.api.concluirPrimeiroAcesso({ fonte: "arquivo", dados: previaArquivo.dados })); ocupado = false; if(ok) previaArquivo = null; assinaturaGate = ""; renderGate(N.info); }
    else if(acao === "fonte-local"){ ocupado = true; await tentar(() => N.api.concluirPrimeiroAcesso({ fonte: "local" })); ocupado = false; }
    else if(acao === "fonte-legado"){ ocupado = true; await tentar(() => N.api.concluirPrimeiroAcesso({ fonte: "legado" })); ocupado = false; }
    else if(acao === "fonte-vazio"){
      const temLocal = !!(N.info.acesso.fontes && N.info.acesso.fontes.local);
      if(temLocal && !await App.confirmar("Começar do zero", "<p>Os dados que estão neste navegador serão <b>descartados</b> e a escala de " + esc(U.UNIDADE) + " começará vazia.</p>", "Começar do zero", true)) return;
      ocupado = true; await tentar(() => N.api.concluirPrimeiroAcesso({ fonte: "vazio" })); ocupado = false;
    }
  });

  // =====================================================================
  //  Aba Propostas (colaborador) / Aprovações (administrador)
  // =====================================================================
  let filtroProp = "pendentes", mesNova = null, partirDe = "atual", assinaturaProp = "";

  const propostasAbertas = () => N.info.propostas.filter(p => p.status === "rascunho" || p.status === "enviada");
  function mesesDisponiveis(){
    const h = new Date(), c = U.clampMesAno(h.getFullYear(), h.getMonth() + 1), out = [];
    let a = c.ano, m = c.mes;
    for(let i = 0; i < 12 && !U.antesDe(U.LIM_SUP.ano, U.LIM_SUP.mes, a, m); i++){
      const chave = a + "-" + m; out.push({ chave, rotulo: U.nomeMesAno(a, m), fechado: App.mesFechado(chave) });
      m++; if(m > 12){ m = 1; a++; }
    }
    return out;
  }
  function avatarDe(pessoa){ return '<span class="avatar-btn">' + U.avatarHtml(pessoa) + '</span>'; }

  function renderBadge(info){
    const el = $("propBadge"); if(!el) return;
    const n = E.papel === "mestre" ? info.acessos.filter(a => a.status === "pendente").length + info.propostas.filter(p => p.status === "enviada").length : 0;
    el.hidden = !n; el.textContent = n;
  }

  // ---- cartão de proposta (colaborador e administrador) ----
  function cardProposta(p, papel){
    const r = App.resumoProposta(p), decidida = p.status === "aprovada" || p.status === "rejeitada";
    const meta = [];
    if(papel === "mestre") meta.push("por <b>" + esc(p.autorNome || p.autorEmail) + "</b>");
    meta.push("atualizada em " + esc(dataHora(p.atualizadoEm)));
    if(p.enviadoEm && p.status !== "rascunho") meta.push("enviada em " + esc(dataHora(p.enviadoEm)));
    if(decidida && p.decididoEm) meta.push((p.status === "aprovada" ? "aprovada" : "rejeitada") + " em " + esc(dataHora(p.decididoEm)));
    if(!decidida) meta.push(U.plural(r.dif, "dia diferente", "dias diferentes") + " da escala atual · " + r.batem + "/" + r.total + " batem a cota");
    const aviso = !decidida && App.mesFechado(p.mes) ? ' <span class="st-chip rejeitada">mês já fechado</span>' : "";
    let acoes = "";
    if(papel === "mestre"){
      acoes = p.status === "enviada" ? '<button class="btn-sm solid" data-p="revisar" data-id="' + esc(p.id) + '">Revisar</button>' : '<button class="btn-sm" data-p="ver" data-id="' + esc(p.id) + '">Ver</button>';
      if(decidida) acoes += '<button class="btn-sm danger" data-p="excluir" data-id="' + esc(p.id) + '">Excluir</button>';
    }else{
      if(p.status === "rascunho") acoes = '<button class="btn-sm solid" data-p="editar" data-id="' + esc(p.id) + '">Editar</button><button class="btn-sm danger" data-p="excluir" data-id="' + esc(p.id) + '">Excluir</button>';
      else if(p.status === "enviada") acoes = '<button class="btn-sm" data-p="ver" data-id="' + esc(p.id) + '">Ver</button><button class="btn-sm" data-p="retirar" data-id="' + esc(p.id) + '">Retirar para editar</button>';
      else if(p.status === "rejeitada") acoes = '<button class="btn-sm" data-p="ver" data-id="' + esc(p.id) + '">Ver</button><button class="btn-sm solid" data-p="retirar" data-id="' + esc(p.id) + '">Reabrir para editar</button><button class="btn-sm danger" data-p="excluir" data-id="' + esc(p.id) + '">Excluir</button>';
      else acoes = '<button class="btn-sm" data-p="ver" data-id="' + esc(p.id) + '">Ver</button>';
    }
    return '<div class="prop-card ' + esc(p.status) + '"><div class="prop-h"><span class="prop-mes">' + esc(nomeMes(p.mes)) + aviso + '</span><span class="st-chip ' + esc(p.status) + '">' + esc(U.STATUS_PROPOSTA[p.status] || p.status) + '</span></div>' +
      '<div class="prop-meta">' + meta.join(" · ") + '</div>' +
      (p.observacao ? '<div class="prop-obs">' + esc(p.observacao) + '</div>' : '') +
      (p.status === "rejeitada" && p.motivo ? '<div class="prop-motivo"><b>Motivo:</b> ' + esc(p.motivo) + '</div>' : '') +
      '<div class="prop-acoes">' + acoes + '</div></div>';
  }
  const ordemStatus = { enviada: 0, rascunho: 1, rejeitada: 2, aprovada: 3 };
  const ordenarProps = lista => lista.slice().sort((a, b) => (ordemStatus[a.status] - ordemStatus[b.status]) || ((b.atualizadoEm || 0) - (a.atualizadoEm || 0)));

  // ---- colaborador ----
  function htmlColaborador(){
    const opcoes = mesesDisponiveis(), livres = opcoes.filter(o => !o.fechado);
    const sel = mesNova && livres.some(o => o.chave === mesNova) ? mesNova : (livres[0] && livres[0].chave);
    const existente = sel ? propostasAbertas().find(p => p.mes === sel) : null;
    const esq = '<section class="panel"><div class="panel-h"><h2>Nova proposta</h2></div><div class="nova-form">' +
      '<p class="hint" style="margin:0 0 14px;font-size:12.5px;color:var(--tinta-3);line-height:1.5">Monte a escala de um mês — ou só sugira mudanças em alguns dias — e envie ao administrador. A escala definitiva só muda quando ele aprovar.</p>' +
      (livres.length ?
        '<div class="field"><label class="lbl" for="novaMes">Mês</label><select class="txt" id="novaMes">' + opcoes.map(o => '<option value="' + esc(o.chave) + '"' + (o.chave === sel ? " selected" : "") + (o.fechado ? " disabled" : "") + '>' + esc(o.rotulo) + (o.fechado ? " (fechado)" : "") + '</option>').join("") + '</select></div>' +
        (existente ? '<p style="font-size:13px;color:var(--tinta-2);margin:0 0 4px">Você já tem uma proposta <b>' + esc((U.STATUS_PROPOSTA[existente.status] || "").toLowerCase()) + '</b> para este mês.</p>' :
          '<div class="field"><span class="lbl">Começar de</span><div class="radio-linha">' +
          '<label><input type="radio" name="partir" value="atual"' + (partirDe === "atual" ? " checked" : "") + '><span>A escala atual do mês<br><small style="color:var(--tinta-3)">você muda só o que precisar</small></span></label>' +
          '<label><input type="radio" name="partir" value="branco"' + (partirDe === "branco" ? " checked" : "") + '><span>Em branco<br><small style="color:var(--tinta-3)">você monta o mês inteiro</small></span></label></div></div>' +
          '<div class="field"><label class="lbl" for="novaObs">Observação para o administrador (opcional)</label><textarea class="txt" id="novaObs" maxlength="2000" placeholder="Ex.: troquei os dias 10 e 11 para cobrir a licença"></textarea></div>') +
        '<button class="add" data-p="criar">' + (existente ? "Abrir proposta existente" : "Criar proposta e editar") + '</button>'
        : '<p style="font-size:13px;color:var(--tinta-2);margin:0">Não há meses abertos para propor agora: os próximos meses já foram fechados pelo administrador.</p>') +
      '</div></section>';
    const lista = ordenarProps(N.info.propostas);
    const dir = '<div class="panel-h"><h2>Minhas propostas</h2><span class="count">' + lista.length + '</span></div>' +
      (!N.info.propostasCarregadas ? '<div class="vazio-sm">Carregando…</div>' :
        lista.length ? lista.map(p => cardProposta(p, "colaborador")).join("") : '<div class="vazio"><div class="vt">Nenhuma proposta ainda</div>Crie a primeira ao lado. Ela fica salva como rascunho até você enviar.</div>');
    return { esq, dir };
  }

  // ---- administrador ----
  function htmlMestre(){
    const ac = N.info.acessos;
    const pend = ac.filter(a => a.status === "pendente").sort((a, b) => (a.solicitadoEm || 0) - (b.solicitadoEm || 0));
    const ok = ac.filter(a => a.status === "autorizado").sort((a, b) => nomeDe(a).localeCompare(nomeDe(b), "pt"));
    const neg = ac.filter(a => a.status === "negado");
    const linhaPessoa = (a, acoes, sub) => '<div class="pessoa-row">' + avatarDe(a) + '<div style="min-width:0"><div class="pn">' + esc(nomeDe(a)) + '</div><div class="pe">' + esc(a.email) + (sub ? " · " + sub : "") + '</div></div><div class="pessoa-acoes">' + acoes + '</div></div>';
    const e = a => 'data-email="' + esc(a.email) + '"';
    const pedidos = '<section class="panel"><div class="panel-h"><h2>Pedidos de acesso</h2><span class="count">' + pend.length + '</span></div>' +
      (!N.info.acessosCarregados ? '<div class="vazio-sm">Carregando…</div>' :
        pend.length ? pend.map(a => linhaPessoa(a,
          '<button class="btn-sm solid" data-a="aut" data-papel="colaborador" ' + e(a) + ' title="Vê a escala e pode enviar propostas">Colaborador</button>' +
          '<button class="btn-sm" data-a="aut" data-papel="leitor" ' + e(a) + ' title="Só visualiza">Só leitura</button>' +
          '<button class="btn-sm danger" data-a="neg" ' + e(a) + '>Negar</button>', "pediu em " + esc(dataHora(a.solicitadoEm)))).join("") :
          '<div class="vazio-sm">Nenhum pedido pendente. Quando alguém entrar com o Google e pedir acesso, aparece aqui.</div>') +
      '</section>';
    const pessoas = '<section class="panel"><div class="panel-h"><h2>Pessoas com acesso</h2><span class="count">' + ok.length + '</span></div>' +
      (ok.length ? ok.map(a => linhaPessoa(a,
        '<select class="sel-sm papel-sel" data-a="papel" ' + e(a) + ' aria-label="Papel de ' + esc(nomeDe(a)) + '"><option value="colaborador"' + (a.papel === "colaborador" ? " selected" : "") + '>Colaborador</option><option value="leitor"' + (a.papel !== "colaborador" ? " selected" : "") + '>Leitor</option></select>' +
        '<button class="btn-sm danger" data-a="rev" ' + e(a) + '>Revogar</button>')).join("") : '<div class="vazio-sm">Ninguém autorizado ainda — só você vê a escala.</div>') +
      '<div class="nova-form" style="border-top:1px solid var(--linha)"><span class="lbl">Autorizar um e-mail antes do pedido</span>' +
      '<div class="fer-add" style="margin-top:6px"><input class="txt sm" id="preEmail" type="email" placeholder="nome@gmail.com" autocomplete="off" style="flex:1;min-width:150px;width:auto">' +
      '<select class="sel-sm" id="prePapel"><option value="colaborador">Colaborador</option><option value="leitor">Leitor</option></select><button class="btn-sm solid" data-a="pre">Autorizar</button></div></div>' +
      (neg.length ? '<details style="border-top:1px solid var(--linha)"><summary style="padding:11px 18px;font-size:12.5px;color:var(--tinta-3);cursor:pointer">Negados (' + neg.length + ')</summary>' +
        neg.map(a => linhaPessoa(a, '<button class="btn-sm" data-a="aut" data-papel="leitor" ' + e(a) + '>Autorizar</button><button class="btn-sm danger" data-a="del" ' + e(a) + '>Excluir</button>')).join("") + '</details>' : '') +
      '</section>';
    const todas = ordenarProps(N.info.propostas), pendentes = todas.filter(p => p.status === "enviada");
    const mostrar = filtroProp === "pendentes" ? pendentes : todas.filter(p => p.status !== "rascunho");
    const dir = '<div class="panel-h"><h2>Propostas recebidas</h2><div class="filtro-prop"><div class="seg" role="group" aria-label="Filtro">' +
      '<button data-a="filtro" data-v="pendentes" class="' + (filtroProp === "pendentes" ? "active" : "") + '">Aguardando (' + pendentes.length + ')</button>' +
      '<button data-a="filtro" data-v="todas" class="' + (filtroProp === "todas" ? "active" : "") + '">Todas</button></div></div></div>' +
      (!N.info.propostasCarregadas ? '<div class="vazio-sm">Carregando…</div>' :
        mostrar.length ? mostrar.map(p => cardProposta(p, "mestre")).join("") :
          '<div class="vazio"><div class="vt">' + (filtroProp === "pendentes" ? "Nenhuma proposta aguardando" : "Nenhuma proposta") + '</div>Quando um colaborador enviar uma proposta para aprovação, ela aparece aqui.</div>');
    return { esq: pedidos + pessoas, dir };
  }

  function renderPropostas(){
    if(E.papel !== "mestre" && E.papel !== "colaborador") return;
    if(E.aba !== "propostas") return;
    const info = N.info;
    const sig = JSON.stringify([E.papel, filtroProp, mesNova, partirDe, info.propostasCarregadas, info.acessosCarregados,
      info.acessos.map(a => [a.id, a.status, a.papel, a.nome]), info.propostas.map(p => [p.id, p.status, p.atualizadoEm, p.motivo]),
      E.fechados.join(","), App.obterJSON().length]);
    if(sig === assinaturaProp) return;
    assinaturaProp = sig;
    // guarda o que a pessoa já digitou: a lista pode redesenhar enquanto ela escreve
    const guarda = {}; ["preEmail", "novaObs"].forEach(id => { const el = $(id); if(el) guarda[id] = el.value; });
    const h = E.papel === "mestre" ? htmlMestre() : htmlColaborador();
    $("propEsq").innerHTML = h.esq; $("propDir").innerHTML = h.dir;
    Object.keys(guarda).forEach(id => { const el = $(id); if(el) el.value = guarda[id]; });
  }

  // ---- ações da aba ----
  const docDe = id => N.info.propostas.find(p => p.id === id);
  function abrirExistente(id, modo){
    const d = docDe(id); if(!d) { App.toast("Proposta não encontrada."); return; }
    App.abrirProposta(d, modo);
  }
  async function criarProposta(){
    const mes = $("novaMes") && $("novaMes").value; if(!mes) return;
    const existente = propostasAbertas().find(p => p.mes === mes);
    if(existente){ abrirExistente(existente.id, existente.status === "rascunho" ? "editar" : "ver"); return; }
    if(App.mesFechado(mes)){ App.toast("Esse mês já está fechado pelo administrador."); return; }
    const partir = (document.querySelector('input[name="partir"]:checked') || {}).value || "atual";
    const base = partir === "atual" ? (E.extra[mes] || {}) : {};
    let doc = null;
    const ok = await tentar(async () => { doc = await N.api.criarProposta({ mes, dias: JSON.stringify(base), equipes: "[]", observacao: ($("novaObs") || { value: "" }).value.trim() }); });
    if(ok && doc){ const o = $("novaObs"); if(o) o.value = ""; App.abrirProposta(doc, "editar"); }
  }

  $("tabPropostas").addEventListener("click", async ev => {
    const b = ev.target.closest("[data-p],[data-a]"); if(!b) return;
    const id = b.dataset.id, email = b.dataset.email;
    if(b.dataset.p){
      const acao = b.dataset.p;
      if(acao === "criar") criarProposta();
      else if(acao === "editar") abrirExistente(id, "editar");
      else if(acao === "ver") abrirExistente(id, "ver");
      else if(acao === "revisar") abrirExistente(id, "revisar");
      else if(acao === "retirar") await tentar(() => N.api.retirarProposta(id));
      else if(acao === "excluir"){
        const d = docDe(id); if(!d) return;
        if(await App.confirmar("Excluir proposta", "<p>Excluir a proposta de <b>" + esc(nomeMes(d.mes)) + "</b>? Isso não pode ser desfeito.</p>", "Excluir", true)) await tentar(() => N.api.excluirProposta(id));
      }
      return;
    }
    const acao = b.dataset.a;
    if(acao === "filtro"){ filtroProp = b.dataset.v; assinaturaProp = ""; renderPropostas(); }
    else if(acao === "aut") await tentar(() => N.api.decidirAcesso(email, { status: "autorizado", papel: b.dataset.papel }));
    else if(acao === "neg") await tentar(() => N.api.decidirAcesso(email, { status: "negado" }));
    else if(acao === "rev"){ if(await App.confirmar("Revogar acesso", "<p>A pessoa <b>" + esc(email) + "</b> deixa de ver a escala imediatamente.</p>", "Revogar", true)) await tentar(() => N.api.decidirAcesso(email, { status: "negado" })); }
    else if(acao === "del") await tentar(() => N.api.removerAcesso(email));
    else if(acao === "pre"){
      const campo = $("preEmail"), v = (campo.value || "").trim();
      if(!v){ campo.focus(); return; }
      if(await tentar(() => N.api.preAutorizar(v, $("prePapel").value))){ campo.value = ""; App.toast("Acesso autorizado para " + v + "."); }
    }
  });
  $("tabPropostas").addEventListener("change", ev => {
    const el = ev.target;
    if(el.id === "novaMes"){ mesNova = el.value; assinaturaProp = ""; renderPropostas(); }
    else if(el.name === "partir"){ partirDe = el.value; }
    else if(el.dataset && el.dataset.a === "papel") tentar(() => N.api.decidirAcesso(el.dataset.email, { status: "autorizado", papel: el.value }));
  });

  // "Propor alterações neste mês" (barra da escala definitiva)
  $("propMesBtn").addEventListener("click", () => { mesNova = chaveAtual(); assinaturaProp = ""; App.setAba("propostas"); });

  // =====================================================================
  //  Barra da proposta na aba extraoficial
  // =====================================================================
  let assinaturaVisao = "";
  function renderVisaoBar(){
    const bar = $("visaoBar"), p = E.prop;
    if(!E.visao || !p){ bar.hidden = true; if(assinaturaVisao){ bar.innerHTML = ""; assinaturaVisao = ""; } return; }
    const modo = E.visao.modo, ativa = App.visaoAtiva(), dif = ativa ? App.diasDiferentes().size : 0;
    const sig = [modo, p.status, p.mes, ativa, dif, p.motivo, modo === "editar" ? "" : p.observacao, E.ano + "-" + E.mes].join("|");
    bar.hidden = false;
    if(sig === assinaturaVisao) return;
    assinaturaVisao = sig;
    bar.className = "visao-bar " + modo;
    const mes = esc(nomeMes(p.mes));
    if(!ativa){
      bar.innerHTML = '<div class="vb-info"><span class="vb-tag">Proposta aberta</span>Você está vendo outro mês. A proposta aberta é a de <b>' + mes + '</b>.</div><div class="vb-acoes"><button class="btn-sm solid" data-v="ir">Voltar à proposta</button><button class="btn-sm" data-v="sair">Fechar proposta</button></div>';
      return;
    }
    const difTxt = '<b>' + U.plural(dif, "dia diferente", "dias diferentes") + '</b> da escala atual (contornados em amarelo)';
    if(modo === "editar"){
      bar.innerHTML = '<div class="vb-info"><span class="vb-tag">Sua proposta</span><b>Rascunho de ' + mes + '</b> — o que você muda fica salvo automaticamente e só vira escala definitiva se o administrador aprovar. ' + difTxt + '.</div>' +
        '<div class="vb-acoes"><button class="btn-sm solid" data-v="enviar">Enviar para aprovação</button><button class="btn-sm" data-v="sair">Sair da proposta</button></div>' +
        '<label class="vb-obs"><span>Observação:</span><input class="txt sm" id="vbObs" maxlength="2000" placeholder="Explique ao administrador o que você mudou (opcional)" value="' + esc(p.observacao) + '"></label>';
    }else if(modo === "revisar"){
      const r = App.resumoProposta({ mes: p.mes, dias: JSON.stringify(p.dias) });
      bar.innerHTML = '<div class="vb-info"><span class="vb-tag">Revisão</span>Proposta de <b>' + esc(p.autorNome || p.autorEmail) + '</b> para <b>' + mes + '</b>' + (p.enviadoEm ? ' · enviada em ' + esc(dataHora(p.enviadoEm)) : '') + '. ' + difTxt + ' · <b>' + r.batem + '/' + r.total + '</b> batem a cota.' + (App.mesFechado(p.mes) ? ' <b>Atenção:</b> este mês já está fechado.' : '') + '</div>' +
        '<div class="vb-acoes"><button class="btn-sm solid" data-v="aprovar">Aprovar…</button><button class="btn-sm danger" data-v="rejeitar">Rejeitar…</button><button class="btn-sm" data-v="sair">Sair da revisão</button></div>' +
        (p.observacao ? '<div class="vb-obs"><span><b>Observação do autor:</b> ' + esc(p.observacao) + '</span></div>' : '');
    }else{ // ver
      const quem = E.papel === "mestre" ? ' de <b>' + esc(p.autorNome || p.autorEmail) + '</b>' : '';
      let situ = "";
      if(p.status === "enviada") situ = 'Enviada — aguardando o administrador. Você pode retirá-la para continuar editando.';
      else if(p.status === "aprovada") situ = 'Aprovada pelo administrador: esta proposta já é a escala definitiva.';
      else if(p.status === "rejeitada") situ = 'Rejeitada pelo administrador.';
      bar.innerHTML = '<div class="vb-info"><span class="vb-tag">Proposta' + (E.papel === "mestre" ? "" : " enviada") + '</span>Proposta' + quem + ' para <b>' + mes + '</b> · ' + esc(situ) + '</div>' +
        '<div class="vb-acoes">' + (E.papel === "colaborador" && p.status === "enviada" ? '<button class="btn-sm solid" data-v="retirar">Retirar para editar</button>' : '') +
        (E.papel === "colaborador" && p.status === "rejeitada" ? '<button class="btn-sm solid" data-v="retirar">Reabrir para editar</button>' : '') +
        '<button class="btn-sm" data-v="sair">Fechar</button></div>' +
        (p.status === "rejeitada" && p.motivo ? '<div class="vb-motivo"><b>Motivo:</b> ' + esc(p.motivo) + '</div>' : '') +
        (p.observacao ? '<div class="vb-obs"><span><b>Observação:</b> ' + esc(p.observacao) + '</span></div>' : '');
    }
  }

  async function enviarProposta(){
    const p = E.prop; if(!p) return;
    const r = App.resumoProposta({ mes: p.mes, dias: JSON.stringify(p.dias) });
    const faltam = r.total - r.batem;
    const sim = await App.confirmar("Enviar para aprovação",
      '<p>Proposta de <b>' + esc(nomeMes(p.mes)) + '</b>: ' + U.plural(r.dif, "dia diferente", "dias diferentes") + ' da escala atual.</p>' +
      (faltam ? '<p><b>Atenção:</b> ' + U.plural(faltam, "perito não bate", "peritos não batem") + ' a cota do mês (veja a Conferência de cotas). O administrador verá isso, mas você pode ajustar antes de enviar.</p>' : '<p>✓ Todas as cotas batem.</p>') +
      '<p>Depois de enviada você não edita mais, a menos que a retire enquanto o administrador ainda não decidiu.</p>', "Enviar");
    if(!sim) return;
    if(await tentar(() => N.api.enviarProposta(p.id))) App.toast("Proposta enviada para aprovação.");
  }
  async function aprovar(){
    const p = E.prop; if(!p) return;
    const doc = docDe(p.id);
    if(!doc || doc.status !== "enviada"){ App.toast("Esta proposta não está mais aguardando aprovação."); return; }
    const r = App.resumoProposta(doc), fechado = App.mesFechado(doc.mes);
    let fechar = true;
    const res = await App.dialogo({
      titulo: "Aprovar proposta",
      html: '<p>O mês de <b>' + esc(nomeMes(doc.mes)) + '</b> na escala definitiva passa a ser o da proposta de <b>' + esc(doc.autorNome || doc.autorEmail) + '</b> (' + U.plural(r.dif, "dia muda", "dias mudam") + '; ' + r.batem + '/' + r.total + ' batem a cota).</p>' +
        (fechado ? '<p><b>Atenção:</b> este mês já está <b>fechado</b>; a proposta vai substituir a escala fechada.</p>' : '') +
        '<label class="chk"><input type="checkbox" id="aprFechar" checked><span>Fechar o mês depois de aplicar<small>A escala fica definitiva e bloqueada para edição. Você pode reabrir quando quiser.</small></span></label>',
      botoes: [{ id: "nao", rotulo: "Cancelar" }, { id: "sim", rotulo: "Aprovar e aplicar", estilo: "solid", aoClicar: c => { fechar = c.querySelector("#aprFechar").checked; } }]
    });
    if(res !== "sim") return;
    if(!App.aplicarPropostaNaDefinitiva(doc, fechar)){ App.toast("Não foi possível aplicar a proposta."); return; }
    try{
      await N.api.decidirProposta(doc.id, { status: "aprovada" });
      App.toast(nomeMes(doc.mes) + " agora é a escala definitiva" + (fechar ? " e foi fechada." : "."));
    }catch(e){
      console.error(e);
      App.toast("A escala foi atualizada, mas não consegui registrar a aprovação agora. Abra a proposta e aprove de novo.");
    }
  }
  async function rejeitar(){
    const p = E.prop; if(!p) return;
    let motivo = "";
    const res = await App.dialogo({
      titulo: "Rejeitar proposta",
      html: '<p>Proposta de <b>' + esc(p.autorNome || p.autorEmail) + '</b> para <b>' + esc(nomeMes(p.mes)) + '</b>. A pessoa vê o motivo e pode corrigir e enviar de novo.</p><div class="field"><label class="lbl" for="rejMotivo">Motivo (recomendado)</label><textarea class="txt" id="rejMotivo" maxlength="1000" placeholder="Ex.: faltou cobrir o dia 10"></textarea></div>',
      botoes: [{ id: "nao", rotulo: "Cancelar" }, { id: "sim", rotulo: "Rejeitar", estilo: "danger-solid", aoClicar: c => { motivo = c.querySelector("#rejMotivo").value.trim(); } }]
    });
    if(res !== "sim") return;
    const id = p.id;
    if(await tentar(() => N.api.decidirProposta(id, { status: "rejeitada", motivo }))){ App.sairProposta(); App.toast("Proposta rejeitada."); }
  }

  $("visaoBar").addEventListener("click", async ev => {
    const b = ev.target.closest("[data-v]"); if(!b || !E.prop) return;
    const acao = b.dataset.v, p = E.prop;
    if(acao === "sair") App.sairProposta();
    else if(acao === "ir"){ const m = /^(\d{4})-(\d{1,2})$/.exec(p.mes), c = U.clampMesAno(+m[1], +m[2]); E.ano = c.ano; E.mes = c.mes; App.render(); }
    else if(acao === "enviar") await enviarProposta();
    else if(acao === "retirar") await tentar(() => N.api.retirarProposta(p.id));
    else if(acao === "aprovar") await aprovar();
    else if(acao === "rejeitar") await rejeitar();
  });
  $("visaoBar").addEventListener("change", ev => { if(ev.target.id === "vbObs") App.definirObservacao(ev.target.value); });

  // =====================================================================
  //  Ligações
  // =====================================================================
  // Se a proposta aberta foi apagada na nuvem, fecha a visão (evita editar algo que não existe mais).
  function conferirPropostaAberta(info){
    if(E.visao && E.prop && info.propostasCarregadas && !info.propostas.some(p => p.id === E.prop.id)){
      App.toast("Esta proposta não existe mais."); App.sairProposta();
    }
  }
  N.aoMudar(info => { renderGate(info); renderBadge(info); conferirPropostaAberta(info); renderPropostas(); });
  App.aoRenderizar(() => { renderVisaoBar(); renderPropostas(); renderBadge(N.info); });
  renderGate(N.info);
})();
