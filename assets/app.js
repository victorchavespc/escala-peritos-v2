(function(){
  "use strict";

  // ---------- Configuração ----------
  const GRUPOS = ["A","B","C","D"];
  const ANCORA_UTC = Date.UTC(2026, 6, 1);      // 01/jul/2026 = Grupo A
  const LIM_INF = {ano:2026, mes:7};
  const LIM_SUP = {ano:2031, mes:12};
  const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const DOW = ["dom","seg","ter","qua","qui","sex","sáb"];
  const DOW_FULL = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const CHAVE = "escala_npf_v2";             // dados da escala (mesma chave da versão anterior: nada se perde)
  const CHAVE_PREFS = "escala_npf_prefs";    // preferências deste navegador (tema, visualização, aba)
  const CHAVE_HIST = "escala_npf_hist";      // versões diárias guardadas neste navegador
  const CHAVE_SYNC = "escala_npf_sync";      // controle da sincronização com a nuvem
  const CHAVE_CACHE = "escala_npf_cache";    // cópia da escala definitiva para quem só visualiza (colaborador/leitor)
  const CHAVE_SESSAO = "escala_npf_sessao";  // último acesso confirmado: permite abrir sem internet
  const VERSAO_DADOS = 3;
  const MAX_DESFAZER = 80;
  const DIAS_HIST_LOCAL = 14;
  const CORES_EQUIPE = ["#C2410C","#0E7490","#7E22CE","#15803D","#B91C1C","#0369A1","#A16207","#BE185D","#4D7C0F","#5B21B6"];
  const GRUPO_COR = {A:"#1F6E8C", B:"#A85532", C:"#4E7A3E", D:"#6E5896"};
  const TIPOS_AFAST = {ferias:"Férias", licenca:"Licença", atestado:"Atestado médico", curso:"Curso / capacitação", outro:"Outro afastamento"};
  const FUSO_BAHIA_H = 3;                    // America/Bahia = UTC−3, sem horário de verão (usado na agenda .ics)
  const FER_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L12 19v-5.5L21 16z"/></svg>';
  const ALERTA_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.8l6.5 11.4H1.5z"/><path d="M8 6.2v3.3M8 11.4h.01"/></svg>';
  const INFO_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8" cy="8" r="6.2"/><path d="M8 7.3v3.6M8 5.2h.01"/></svg>';
  const RE_ID = /^[A-Za-z0-9_-]{1,40}$/, RE_ISO = /^\d{4}-\d{2}-\d{2}$/, RE_COR = /^#[0-9a-fA-F]{6}$/, RE_MES = /^\d{4}-\d{1,2}$/, RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
  const CFG = window.ESCALA_CONFIG || {};
  const NUVEM_ATIVA = !!(CFG.firebase && CFG.firebase.apiKey) && location.protocol !== "file:";
  const UNIDADE = CFG.unidade || "Itaberaba";
  const STATUS_PROPOSTA = {rascunho:"Rascunho", enviada:"Enviada", aprovada:"Aprovada", rejeitada:"Rejeitada"};
  const PAPEIS = {mestre:"Administrador", colaborador:"Colaborador", leitor:"Leitor", local:"Uso local"};

  const hoje = new Date();
  let estado = {
    ano:2026, mes:7,
    aba:"oficial",
    peritos:[],          // {id, nome, grupo, ferias:[{ini, fim, tipo}]}
    equipes:[],          // {id, membros:[pid], cor, recorrente, diasPadrao:[]}
    extra:{},            // { "2026-7": { dia: [pid, ...] } }
    fechados:[],         // ["2026-7", ...]
    feriadosExtras:[],   // [{data:"2026-12-08", nome}]
    config:{horaInicio:"08:00"},
    pincel:null,         // { tipo:'equipe'|'perito'|'borracha', ref:id }
    feriasAberta:null,   // id do perito com painel de afastamentos aberto
    destaque:null,       // id do perito destacado nos calendários
    papel:null,          // 'local' | 'mestre' | 'colaborador' | 'leitor' (null = ainda sem acesso)
    visao:null,          // null = escala definitiva; {modo:'editar'|'ver'|'revisar'} = há uma proposta aberta
    prop:null,           // cópia de trabalho da proposta aberta: {id, mes, dias:{}, equipes:[], observacao, status, ...}
    busca:"",
    viewOficial:"grade", // grade | lista
    viewExtra:"grade"
  };
  const prefs = lerJSON(CHAVE_PREFS) || {};

  // ---------- Utilidades de armazenamento local ----------
  function lerJSON(chave){ try{ const raw=localStorage.getItem(chave); return raw?JSON.parse(raw):null; }catch(e){ return null; } }
  function gravarJSON(chave,valor){ try{ localStorage.setItem(chave, typeof valor==="string"?valor:JSON.stringify(valor)); return true; }catch(e){ return false; } }
  function removerChave(chave){ try{ localStorage.removeItem(chave); }catch(e){} }
  function salvarPrefs(){ gravarJSON(CHAVE_PREFS,{tema:prefs.tema||"auto", viewOficial:estado.viewOficial, viewExtra:estado.viewExtra, aba:estado.aba, destaque:estado.destaque||null}); }

  const Store = {
    async load(){
      // localStorage: persiste no navegador deste computador, entre sessões, sem precisar de internet.
      const local=lerJSON(CHAVE);
      if(local) return local;
      // migração do schema antigo (window.storage do claude.ai, só peritos)
      try{ if(window.storage&&window.storage.get){ const r=await window.storage.get("escala_npf_v1"); if(r&&r.value){ return {peritos:JSON.parse(r.value)}; } } }catch(e){}
      // migração do schema v2 antigo salvo via window.storage (ambiente claude.ai)
      try{ if(window.storage&&window.storage.get){ const r=await window.storage.get(CHAVE); if(r&&r.value) return JSON.parse(r.value); } }catch(e){}
      return null;
    },
    save(json){
      if(!gravarJSON(CHAVE,json)){ toast("Não foi possível salvar neste navegador. Verifique o espaço/permissões."); return; }
      HistLocal.registrar(json);
    }
  };

  // Uma "foto" por dia dos dados, guardada neste navegador (as versões da nuvem ficam no Firestore).
  const HistLocal = {
    ler(){ const h=lerJSON(CHAVE_HIST); return (h&&typeof h==="object")?h:{}; },
    registrar(json){
      const h=this.ler(); h[isoDe(new Date())]={json, em:Date.now()};
      const ks=Object.keys(h).sort(); while(ks.length>DIAS_HIST_LOCAL) delete h[ks.shift()];
      gravarJSON(CHAVE_HIST,h);
    },
    listar(){ const h=this.ler(); return Object.keys(h).sort().reverse().map(k=>({id:k, em:h[k].em, json:h[k].json})); }
  };

  // Controle da sincronização: {uid, rev, pendente}. "pendente" = há alteração local ainda não confirmada pela nuvem.
  const SyncMeta = {
    ler(){ const m=lerJSON(CHAVE_SYNC); return (m&&typeof m==="object")?m:{uid:null,rev:0,pendente:false}; },
    gravar(m){ gravarJSON(CHAVE_SYNC,m); }
  };

  // ---------- Sanitização dos dados (arquivo importado, nuvem ou navegador) ----------
  function sanitizar(fonte){
    fonte = Array.isArray(fonte) ? {peritos:fonte} : ((fonte&&typeof fonte==="object") ? fonte : {});
    const vistos=new Set();
    const peritos=(Array.isArray(fonte.peritos)?fonte.peritos:[]).filter(p=>p&&p.nome&&GRUPOS.includes(p.grupo)).map(p=>{
      let id=String(p.id||""); if(!RE_ID.test(id)||vistos.has(id)) id=uid(); vistos.add(id);
      const ferias=(Array.isArray(p.ferias)?p.ferias:[]).filter(f=>f&&RE_ISO.test(f.ini)&&RE_ISO.test(f.fim)&&f.ini<=f.fim)
        .map(f=>({ini:f.ini, fim:f.fim, tipo:Object.prototype.hasOwnProperty.call(TIPOS_AFAST,f.tipo)?f.tipo:"ferias"}));
      return {id, nome:String(p.nome).trim().slice(0,80)||"?", grupo:p.grupo, ferias};
    });
    const ids=new Set(peritos.map(p=>p.id));
    const equipesBrutas=Array.isArray(fonte.equipes)?fonte.equipes:[];
    const membrosPorEquipe={}; // para migrar o formato antigo (dia -> equipeId)
    equipesBrutas.forEach(x=>{ if(x&&x.id&&Array.isArray(x.membros)) membrosPorEquipe[String(x.id)]=x.membros.map(String).filter(m=>ids.has(m)); });
    const eqVistos=new Set();
    const equipes=equipesBrutas.filter(x=>x&&Array.isArray(x.membros)).map((x,i)=>{
      let id=String(x.id||""); if(!RE_ID.test(id)||eqVistos.has(id)) id=uid(); eqVistos.add(id);
      return {
        id,
        membros:[...new Set(x.membros.map(String))].filter(m=>ids.has(m)).slice(0,3),
        cor:RE_COR.test(x.cor)?x.cor:CORES_EQUIPE[i%CORES_EQUIPE.length],
        recorrente:!!x.recorrente,
        diasPadrao:[...new Set((Array.isArray(x.diasPadrao)?x.diasPadrao:[]).map(Number).filter(d=>Number.isInteger(d)&&d>=1&&d<=31))].sort((a,b)=>a-b)
      };
    }).filter(e=>e.membros.length);
    const extra={};
    if(fonte.extra&&typeof fonte.extra==="object"&&!Array.isArray(fonte.extra)){
      Object.keys(fonte.extra).filter(k=>RE_MES.test(k)).sort(compararChaveMes).forEach(k=>{
        const [a,m]=k.split("-").map(Number); if(m<1||m>12) return;
        const mesObj=fonte.extra[k]; if(!mesObj||typeof mesObj!=="object") return;
        const nd=diasNoMes(a,m), out={};
        Object.keys(mesObj).forEach(ds=>{
          const d=+ds; if(!Number.isInteger(d)||d<1||d>nd) return;
          const v=mesObj[ds]; let arr=[];
          if(typeof v==="string") arr=membrosPorEquipe[v]||[];
          else if(Array.isArray(v)) arr=v.map(String).filter(id=>ids.has(id));
          arr=[...new Set(arr)]; if(arr.length) out[d]=arr;
        });
        if(Object.keys(out).length) extra[a+"-"+m]=Object.assign(extra[a+"-"+m]||{},out);
      });
    }
    const fechados=[...new Set((Array.isArray(fonte.fechados)?fonte.fechados:[]).map(String).filter(k=>RE_MES.test(k)).map(k=>{ const [a,m]=k.split("-").map(Number); return a+"-"+m; }))];
    const ferVistos=new Set();
    const feriadosExtras=(Array.isArray(fonte.feriadosExtras)?fonte.feriadosExtras:[])
      .filter(f=>f&&RE_ISO.test(f.data)&&f.nome&&!ferVistos.has(f.data)&&ferVistos.add(f.data))
      .map(f=>({data:f.data, nome:String(f.nome).trim().slice(0,60)})).sort((a,b)=>a.data.localeCompare(b.data));
    const cfg=(fonte.config&&typeof fonte.config==="object")?fonte.config:{};
    return {peritos, equipes, extra, fechados, feriadosExtras, config:{horaInicio:RE_HORA.test(cfg.horaInicio)?cfg.horaInicio:"08:00"}};
  }
  function aplicarDados(fonte){
    const s=sanitizar(fonte);
    estado.peritos=s.peritos; estado.equipes=s.equipes; estado.extra=s.extra; estado.fechados=s.fechados;
    estado.feriadosExtras=s.feriadosExtras; estado.config=s.config;
    if(estado.pincel){ const pc=estado.pincel; if((pc.tipo==="equipe"&&!equipePorId(pc.ref))||(pc.tipo==="perito"&&!peritoPorId(pc.ref))) estado.pincel=null; }
    if(estado.destaque&&!peritoPorId(estado.destaque)) estado.destaque=null;
    if(estado.feriasAberta&&!peritoPorId(estado.feriasAberta)) estado.feriasAberta=null;
  }
  function snapshot(){
    const extra={};
    Object.keys(estado.extra).sort(compararChaveMes).forEach(k=>{ const m=estado.extra[k]; if(m&&Object.keys(m).length) extra[k]=m; });
    return {versao:VERSAO_DADOS, peritos:estado.peritos, equipes:estado.equipes, extra, fechados:estado.fechados, feriadosExtras:estado.feriadosExtras, config:estado.config};
  }
  function canonico(json){ try{ const s=sanitizar(JSON.parse(json)); return JSON.stringify(Object.assign({versao:VERSAO_DADOS},s)); }catch(e){ return ""; } }
  function temDados(){ return !!(estado.peritos.length||estado.equipes.length||Object.keys(estado.extra).some(k=>Object.keys(estado.extra[k]).length)||estado.feriadosExtras.length); }

  // Conteúdo de uma proposta vinda da nuvem: só dias válidos do mês e peritos que existem. Nunca confiar no que chega.
  function dadosDeProposta(doc){
    const bruto=(t,padrao)=>{ try{ const v=JSON.parse(t); return v==null?padrao:v; }catch(e){ return padrao; } };
    const dias=bruto(doc&&doc.dias,{}), equipes=bruto(doc&&doc.equipes,[]);
    const m=/^(\d{4})-(\d{1,2})$/.exec((doc&&doc.mes)||""), nd=m&&+m[2]>=1&&+m[2]<=12?diasNoMes(+m[1],+m[2]):0;
    const ids=new Set(estado.peritos.map(p=>p.id)), out={};
    if(dias&&typeof dias==="object"&&!Array.isArray(dias)) Object.keys(dias).forEach(ds=>{
      const d=+ds; if(!Number.isInteger(d)||d<1||d>nd||!Array.isArray(dias[ds])) return;
      const arr=[...new Set(dias[ds].map(String))].filter(id=>ids.has(id)).slice(0,20); if(arr.length) out[d]=arr;
    });
    const eqs=(Array.isArray(equipes)?equipes:[]).filter(x=>x&&Array.isArray(x.membros)).map((x,i)=>({
      id:RE_ID.test(String(x.id||""))?String(x.id):uid(),
      membros:[...new Set(x.membros.map(String))].filter(id=>ids.has(id)).slice(0,3),
      cor:RE_COR.test(x.cor)?x.cor:CORES_EQUIPE[i%CORES_EQUIPE.length], recorrente:false, diasPadrao:[]
    })).filter(e=>e.membros.length);
    return {dias:out, equipes:eqs};
  }
  function saneaProposta(p){
    const ids=new Set(estado.peritos.map(x=>x.id));
    Object.keys(p.dias).forEach(d=>{ const arr=p.dias[d].filter(id=>ids.has(id)); if(arr.length) p.dias[d]=arr; else delete p.dias[d]; });
    p.equipes=p.equipes.map(e=>Object.assign({},e,{membros:e.membros.filter(id=>ids.has(id))})).filter(e=>e.membros.length);
  }

  // ---------- Desfazer / refazer + gravação ----------
  // Cada alteração passa por persistir(): compara a "foto" atual com a anterior e empilha para desfazer.
  const hist = {atual:"", desfazer:[], refazer:[]};
  const ouvintes = [];
  const ganchosRender = [];
  function persistir(){
    if(estado.visao){ persistirProposta(); return; }   // com uma proposta aberta, o que muda é a proposta — nunca a definitiva
    if(!ehEditorDef()) return;
    const json=JSON.stringify(snapshot());
    if(json===hist.atual) return;
    hist.desfazer.push(hist.atual); if(hist.desfazer.length>MAX_DESFAZER) hist.desfazer.shift();
    hist.refazer=[];
    hist.atual=json;
    gravar("local");
  }
  function gravar(origem){
    Store.save(hist.atual);
    if(origem!=="nuvem"){ const m=SyncMeta.ler(); if(!m.pendente){ m.pendente=true; SyncMeta.gravar(m); } }
    atualizarBotoesHist();
    ouvintes.forEach(cb=>{ try{ cb(hist.atual,origem); }catch(e){ console.error(e); } });
  }
  // Proposta aberta (colaborador editando / administrador revisando): cópia de trabalho própria, com desfazer próprio.
  const histProp = {atual:"", desfazer:[], refazer:[]};
  const ouvintesProposta = [];
  function snapshotProp(){ const p=estado.prop; return p?JSON.stringify({dias:p.dias, equipes:p.equipes, observacao:p.observacao||""}):""; }
  function avisarProposta(){ const p=estado.prop; ouvintesProposta.forEach(cb=>{ try{ cb(p); }catch(e){ console.error(e); } }); }
  function persistirProposta(){
    const p=estado.prop; if(!p||!estado.visao||estado.visao.modo!=="editar") return;
    const json=snapshotProp(); if(json===histProp.atual) return;
    histProp.desfazer.push(histProp.atual); if(histProp.desfazer.length>MAX_DESFAZER) histProp.desfazer.shift();
    histProp.refazer=[]; histProp.atual=json;
    atualizarBotoesHist(); avisarProposta();
  }
  function restaurarProp(json){
    const p=estado.prop, o=safeParse(json)||{};
    p.dias=o.dias||{}; p.equipes=o.equipes||[]; p.observacao=o.observacao||"";
    saneaProposta(p);
    if(estado.pincel&&estado.pincel.tipo==="equipe"&&!equipePorId(estado.pincel.ref)) estado.pincel=null;
    avisarProposta();
  }
  function desfazer(){
    if(estado.visao){
      if(estado.visao.modo!=="editar"||!histProp.desfazer.length) return;
      histProp.refazer.push(histProp.atual); histProp.atual=histProp.desfazer.pop();
      restaurarProp(histProp.atual); render(); toast("Alteração desfeita."); return;
    }
    if(!ehEditorDef()||!hist.desfazer.length) return;
    hist.refazer.push(hist.atual); hist.atual=hist.desfazer.pop();
    aplicarDados(JSON.parse(hist.atual)); gravar("local"); render(); toast("Alteração desfeita.");
  }
  function refazer(){
    if(estado.visao){
      if(estado.visao.modo!=="editar"||!histProp.refazer.length) return;
      histProp.desfazer.push(histProp.atual); histProp.atual=histProp.refazer.pop();
      restaurarProp(histProp.atual); render(); toast("Alteração refeita."); return;
    }
    if(!ehEditorDef()||!hist.refazer.length) return;
    hist.desfazer.push(hist.atual); hist.atual=hist.refazer.pop();
    aplicarDados(JSON.parse(hist.atual)); gravar("local"); render(); toast("Alteração refeita.");
  }
  function atualizarBotoesHist(){
    const u=document.getElementById("undoBtn"), r=document.getElementById("redoBtn");
    if(estado.visao){ const ed=estado.visao.modo==="editar"; u.disabled=!ed||!histProp.desfazer.length; r.disabled=!ed||!histProp.refazer.length; }
    else{ const ed=ehEditorDef(); u.disabled=!ed||!hist.desfazer.length; r.disabled=!ed||!hist.refazer.length; }
  }

  // ---------- Helpers de calendário/grupos ----------
  function diasNoMes(ano,mes){ return new Date(ano,mes,0).getDate(); }
  function indiceGrupo(ano,mes,dia){ const t=Date.UTC(ano,mes-1,dia); const diff=Math.round((t-ANCORA_UTC)/86400000); return ((diff%4)+4)%4; }
  function grupoDoDia(ano,mes,dia){ return GRUPOS[indiceGrupo(ano,mes,dia)]; }
  function diasDoGrupo(grupo,ano,mes){ const gi=GRUPOS.indexOf(grupo),fim=diasNoMes(ano,mes),o=[]; for(let d=1;d<=fim;d++) if(indiceGrupo(ano,mes,d)===gi) o.push(d); return o; }
  function diaInicioGrupo(grupo,ano,mes){ const dd=diasDoGrupo(grupo,ano,mes); return dd.length?dd[0]:null; }
  function cotaPerito(p,ano,mes){ return diasDoGrupo(p.grupo,ano,mes).length; }
  function compararChaveMes(a,b){ const [a1,m1]=a.split("-").map(Number),[a2,m2]=b.split("-").map(Number); return a1-a2||m1-m2; }
  function _pad2(n){ return n<10?"0"+n:""+n; }
  function isoDe(dt){ return dt.getFullYear()+"-"+_pad2(dt.getMonth()+1)+"-"+_pad2(dt.getDate()); }
  function isoDia(ano,mes,dia){ return ano+"-"+_pad2(mes)+"-"+_pad2(dia); }
  // --- Férias e afastamentos ---
  function parseISO(s){ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||""); return m?Date.UTC(+m[1],+m[2]-1,+m[3]):null; }
  function fmtData(iso){ const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso||""); return m?(m[3]+"/"+m[2]+"/"+m[1]):""; }
  function afastamentoNoDia(p,ano,mes,dia){
    if(!p||!p.ferias||!p.ferias.length) return null;
    const t=Date.UTC(ano,mes-1,dia);
    return p.ferias.find(f=>{ const a=parseISO(f.ini),b=parseISO(f.fim); return a!=null&&b!=null&&t>=a&&t<=b; })||null;
  }
  function diaEmFerias(p,ano,mes,dia){ return !!afastamentoNoDia(p,ano,mes,dia); }
  function diasGrupoEmFerias(p,ano,mes){ return diasDoGrupo(p.grupo,ano,mes).filter(d=>diaEmFerias(p,ano,mes,d)).length; }
  function cotaEfetiva(p,ano,mes){ return cotaPerito(p,ano,mes)-diasGrupoEmFerias(p,ano,mes); }
  function temFeriasNoMes(p,ano,mes){ const nd=diasNoMes(ano,mes); for(let d=1;d<=nd;d++) if(diaEmFerias(p,ano,mes,d)) return true; return false; }

  // --- Feriados (nacionais, estaduais BA, datas importantes + personalizados) ---
  function pascoa(ano){ // domingo de Páscoa (UTC), algoritmo de Meeus/Gauss
    const a=ano%19,b=Math.floor(ano/100),c=ano%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mes=Math.floor((h+l-7*m+114)/31),dia=((h+l-7*m+114)%31)+1;
    return Date.UTC(ano,mes-1,dia);
  }
  const _cacheFer={};
  function feriadosAno(ano){
    if(_cacheFer[ano]) return _cacheFer[ano];
    const fix=[["01-01","Ano Novo"],["04-21","Tiradentes"],["05-01","Dia do Trabalho"],["06-24","São João"],["07-02","Independência da Bahia"],["09-07","Independência"],["10-12","N. Sra. Aparecida"],["11-02","Finados"],["11-15","Proclamação da República"],["11-20","Consciência Negra"],["12-25","Natal"]];
    const mp={}; fix.forEach(x=>mp[x[0]]=x[1]);
    const base=pascoa(ano);
    const off=o=>{ const dt=new Date(base+o*86400000); return _pad2(dt.getUTCMonth()+1)+"-"+_pad2(dt.getUTCDate()); };
    mp[off(-48)]="Carnaval"; mp[off(-47)]="Carnaval"; mp[off(-2)]="Sexta-feira Santa";
    _cacheFer[ano]=mp; return mp;
  }
  function feriadoNome(ano,mes,dia){
    const iso=isoDia(ano,mes,dia), pers=estado.feriadosExtras.find(f=>f.data===iso);
    return pers?pers.nome:(feriadosAno(ano)[_pad2(mes)+"-"+_pad2(dia)]||null);
  }
  function diaDaSemana(ano,mes,dia){ return new Date(ano,mes-1,dia).getDay(); }
  function ehHoje(ano,mes,dia){ const h=new Date(); return h.getFullYear()===ano&&h.getMonth()+1===mes&&h.getDate()===dia; }
  function primeiroNome(n){ return (n||"").trim().split(/\s+/)[0]||n; }
  function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
  function peritosDoGrupo(g){ return estado.peritos.filter(p=>p.grupo===g); }
  function peritoPorId(id){ return estado.peritos.find(p=>p.id===id); }
  function equipePorId(id){ return equipesEf().find(e=>e.id===id); }
  function ordenarPeritos(lista){ return lista.slice().sort((a,b)=>a.grupo===b.grupo?a.nome.localeCompare(b.nome,"pt"):a.grupo.localeCompare(b.grupo)); }
  function nomeMesAno(ano,mes){ return MESES[mes-1].charAt(0).toUpperCase()+MESES[mes-1].slice(1)+" de "+ano; }
  function plural(n,s,p){ return n+" "+(n===1?s:(p||s+"s")); }

  // ---------- Limites ----------
  function antesDe(a1,m1,a2,m2){ return a1<a2||(a1===a2&&m1<m2); }
  function clampMesAno(ano,mes){
    if(antesDe(ano,mes,LIM_INF.ano,LIM_INF.mes)) return {ano:LIM_INF.ano,mes:LIM_INF.mes};
    if(antesDe(LIM_SUP.ano,LIM_SUP.mes,ano,mes)) return {ano:LIM_SUP.ano,mes:LIM_SUP.mes};
    return {ano,mes};
  }

  // ---------- Extra: chaves e parsing ----------
  function chaveMes(ano,mes){ return (ano||estado.ano)+"-"+(mes||estado.mes); }
  // Há proposta aberta E o mês exibido é o dela: o calendário mostra (e edita) os dias da proposta.
  function visaoAtiva(){ return !!(estado.visao&&estado.prop&&estado.prop.mes===chaveMes()); }
  function mapaMes(ano,mes,criar){
    const k=chaveMes(ano,mes);
    if(estado.visao&&estado.prop&&estado.prop.mes===k) return estado.prop.dias;
    if(criar&&!estado.extra[k]) estado.extra[k]={};
    return estado.extra[k]||null;
  }
  function extraDoMes(ano,mes){ return mapaMes(ano,mes,false)||{}; }                  // somente leitura
  function mesFechado(ano,mes){ return estado.fechados.includes(chaveMes(ano,mes)); } // fechado na escala DEFINITIVA
  function ehEditorDef(){ return estado.papel==="local"||estado.papel==="mestre"; }
  // Pode alterar o que está na tela agora? Com proposta aberta: só o autor, e só em rascunho.
  // Sem proposta: só administrador/uso local, e só em mês aberto.
  function editavelAgora(){
    if(estado.visao) return visaoAtiva()&&estado.visao.modo==="editar";
    return ehEditorDef()&&!mesFechado();
  }
  function equipesEf(){ return visaoAtiva()?estado.equipes.concat(estado.prop.equipes):estado.equipes; }
  function equipeLocalDaProposta(e){ return !!(estado.prop&&estado.prop.equipes.includes(e)); }
  // Todos os meses lançados (a proposta aberta substitui o mês dela), para as contagens de equidade.
  function todosMapas(){
    const r=Object.keys(estado.extra).map(k=>({k, m:estado.extra[k]}));
    if(estado.visao&&estado.prop){ const i=r.findIndex(x=>x.k===estado.prop.mes), x={k:estado.prop.mes, m:estado.prop.dias}; if(i>=0) r[i]=x; else r.push(x); }
    return r;
  }
  // Dias do mês exibido em que a proposta difere da escala definitiva.
  function diasDiferentes(){
    const s=new Set(); if(!visaoAtiva()) return s;
    const def=estado.extra[chaveMes()]||{}, prop=estado.prop.dias, nd=diasNoMes(estado.ano,estado.mes);
    for(let d=1;d<=nd;d++) if(!mesmoConjunto(def[d]||[],prop[d]||[])) s.add(d);
    return s;
  }
  // Resumo de qualquer proposta (para as listas): diferenças e cotas, conforme os peritos de hoje.
  function resumoProposta(doc){
    const dd=dadosDeProposta(doc), m=/^(\d{4})-(\d{1,2})$/.exec((doc&&doc.mes)||"");
    if(!m) return {dif:0,batem:0,total:estado.peritos.length,dias:0,nd:0};
    const a=+m[1], mm=+m[2], nd=diasNoMes(a,mm), def=estado.extra[doc.mes]||{};
    let dif=0; for(let d=1;d<=nd;d++) if(!mesmoConjunto(def[d]||[],dd.dias[d]||[])) dif++;
    let batem=0; estado.peritos.forEach(p=>{ let n=0; Object.keys(dd.dias).forEach(ds=>{ if(dd.dias[ds].includes(p.id)&&!diaEmFerias(p,a,mm,+ds)) n++; }); if(n===cotaEfetiva(p,a,mm)) batem++; });
    return {dif, batem, total:estado.peritos.length, dias:Object.keys(dd.dias).length, nd};
  }

  // --- Modelo: cada dia guarda diretamente uma lista de peritos (materializada) ---
  function ocupantesDoDia(d,ano,mes){ const v=extraDoMes(ano,mes)[d]; return Array.isArray(v)?v:[]; }
  function setOcupantes(d,arr,ano,mes){
    const limpo=[...new Set(arr)].filter(id=>peritoPorId(id));
    if(limpo.length){ mapaMes(ano,mes,true)[d]=limpo; return; }
    const k=chaveMes(ano,mes), m=mapaMes(ano,mes,false); if(!m) return;
    delete m[d];
    if(m===estado.extra[k]&&!Object.keys(m).length) delete estado.extra[k];
  }
  function mesmoConjunto(a,b){ if(a.length!==b.length) return false; const sa=new Set(a); return b.every(x=>sa.has(x)); }
  function equipeDoDia(d){ const oc=ocupantesDoDia(d); if(!oc.length) return null; return equipesEf().find(e=>mesmoConjunto(e.membros,oc))||null; }
  function corDoDia(d){ const oc=ocupantesDoDia(d); if(!oc.length) return null; const eq=equipeDoDia(d); return eq?eq.cor:"#64748B"; }
  function tituloEscala(aba){
    return (aba==="oficial"?"Escala oficial dos Peritos Criminais":"Escala dos Peritos Criminais")+" · "+nomeMesAno(estado.ano,estado.mes)+(aba!=="oficial"&&visaoAtiva()?" — PROPOSTA (não é a escala definitiva)":"");
  }

  function parseDias(txt,maxDia){
    const out=new Set();
    String(txt||"").split(/[,;]/).forEach(p=>{
      p=p.trim(); if(!p) return;
      const m=p.match(/^(\d+)\s*-\s*(\d+)$/);
      if(m){ let a=+m[1],b=+m[2]; if(a>b)[a,b]=[b,a]; for(let d=a;d<=b;d++) if(d>=1&&d<=maxDia) out.add(d); }
      else{ const d=+p; if(d>=1&&d<=maxDia) out.add(d); }
    });
    return [...out].sort((x,y)=>x-y);
  }
  function compactaDias(dias){
    if(!dias.length) return "—";
    const s=[...dias].sort((a,b)=>a-b),out=[]; let ini=s[0],prev=s[0];
    for(let i=1;i<=s.length;i++){
      if(s[i]===prev+1){ prev=s[i]; continue; }
      out.push(ini===prev?(""+ini):(ini+"-"+prev)); ini=s[i]; prev=s[i];
    }
    return out.join(", ");
  }
  function escapar(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function nomePessoa(id,curto){ const p=peritoPorId(id); return p?(curto?primeiroNome(p.nome):p.nome):"?"; }
  function spanNome(p,d,curto){
    const fer=diaEmFerias(p,estado.ano,estado.mes,d), cls=[fer?"ferias-risco":"", estado.destaque===p.id?"eu":""].filter(Boolean).join(" ");
    return '<span'+(cls?' class="'+cls+'"':'')+'>'+escapar(curto?primeiroNome(p.nome):p.nome)+'</span>';
  }

  // ---------- Avisos e diálogos ----------
  function toast(msg,acao){
    const t=document.getElementById("toast"), m=document.getElementById("toastMsg");
    m.textContent=msg;
    const velho=t.querySelector("button"); if(velho) velho.remove();
    if(acao){ const b=document.createElement("button"); b.type="button"; b.textContent=acao.rotulo; b.addEventListener("click",()=>{ t.classList.remove("show"); acao.fn(); }); t.appendChild(b); }
    t.classList.add("show");
    clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove("show"), acao?6000:2800);
  }
  // Abre o diálogo genérico. botoes: [{id, rotulo, estilo}] → resolve com o id escolhido (ou null se fechar).
  // Diálogos pedidos ao mesmo tempo (ex.: pergunta da nuvem durante uma confirmação) entram em fila.
  let filaDialogos=Promise.resolve();
  function dialogo(opcoes){ const p=filaDialogos.then(()=>abrirDialogo(opcoes)); filaDialogos=p.catch(()=>{}); return p; }
  function abrirDialogo({titulo,html,botoes,coluna,aoAbrir}){
    return new Promise(resolve=>{
      const dlg=document.getElementById("dlg"), corpo=document.getElementById("dlgCorpo"), bx=document.getElementById("dlgBotoes");
      document.getElementById("dlgTitulo").textContent=titulo;
      corpo.innerHTML=html; bx.innerHTML=""; bx.classList.toggle("col",!!coluna);
      let valor=null;
      (botoes||[{id:"ok",rotulo:"OK",estilo:"solid"}]).forEach(b=>{
        const el=document.createElement("button"); el.type="button"; el.className="btn-sm "+(b.estilo||""); el.textContent=b.rotulo;
        el.addEventListener("click",()=>{ valor=b.id; if(b.aoClicar) b.aoClicar(corpo); dlg.close(); });
        bx.appendChild(el);
      });
      dlg.addEventListener("close",function fim(){ dlg.removeEventListener("close",fim); resolve(valor); });
      dlg.showModal();
      if(aoAbrir) aoAbrir(corpo);
      const foco=bx.querySelector(".solid,.danger-solid"); if(foco) foco.focus();
    });
  }
  async function confirmar(titulo,html,rotuloOk,perigo){
    const r=await dialogo({titulo,html,botoes:[{id:"nao",rotulo:"Cancelar"},{id:"sim",rotulo:rotuloOk||"Confirmar",estilo:perigo?"danger-solid":"solid"}]});
    return r==="sim";
  }

  // ============ RENDER GERAL ============
  function render(){
    popularMeses(estado.ano);
    document.getElementById("anoSel").value=String(estado.ano);
    document.getElementById("mesSel").value=String(estado.mes);
    document.getElementById("prev").disabled=!antesDe(LIM_INF.ano,LIM_INF.mes,estado.ano,estado.mes);
    document.getElementById("next").disabled=!antesDe(estado.ano,estado.mes,LIM_SUP.ano,LIM_SUP.mes);
    atualizarSeletorGrupos();
    renderGrupos();
    renderLista();
    renderDestaque();
    renderCalendario();
    renderTabelaOficial();
    aplicarView("oficial");
    document.getElementById("calTitle").textContent=nomeMesAno(estado.ano,estado.mes);
    renderExtra();
    atualizarBotoesHist();
  }

  function atualizarSeletorGrupos(){
    GRUPOS.forEach(g=>{
      const el=document.querySelector('.grp-opt[data-g="'+g+'"] .gd');
      if(el){ const di=diaInicioGrupo(g,estado.ano,estado.mes); el.textContent=di?"dia "+di:"—"; }
    });
  }

  // ---------- Oficial: grupos, lista, calendário ----------
  function renderGrupos(){
    const box=document.getElementById("gcards"); box.innerHTML="";
    GRUPOS.forEach(g=>{
      const dias=diasDoGrupo(g,estado.ano,estado.mes), np=peritosDoGrupo(g).length;
      const card=document.createElement("div"); card.className="gcard "+g;
      card.innerHTML='<div class="gh"><span class="gname">Grupo '+g+'</span><span class="tag">começa dia '+(diaInicioGrupo(g,estado.ano,estado.mes)||"—")+'</span></div>'+
        '<div class="days">'+dias.join("  ")+'</div>'+
        '<div class="gfoot"><span><span class="big">'+dias.length+'</span> <span class="blab">plantões</span></span>'+
        '<span><span class="big">'+np+'</span> <span class="blab">perito'+(np===1?"":"s")+'</span></span></div>';
      box.appendChild(card);
    });
  }

  function renderLista(){
    const lista=document.getElementById("lista"), total=document.getElementById("totalPeritos");
    total.textContent=plural(estado.peritos.length,"perito");
    document.getElementById("buscaWrap").hidden=estado.peritos.length<8;
    lista.innerHTML="";
    if(!estado.peritos.length){ lista.innerHTML='<div class="vazio"><div class="vt">Nenhum perito cadastrado</div>Cadastre os peritos e atribua o grupo de cada um.</div>'; return; }
    const termo=estado.busca.trim().toLocaleLowerCase("pt");
    const ord=ordenarPeritos(estado.peritos).filter(p=>!termo||p.nome.toLocaleLowerCase("pt").includes(termo));
    if(!ord.length){ lista.innerHTML='<div class="vazio">Nenhum perito encontrado para “'+escapar(estado.busca)+'”.</div>'; return; }
    ord.forEach(p=>{
      const ed=ehEditorDef();
      const nplant=diasDoGrupo(p.grupo,estado.ano,estado.mes).length;
      const temFer=temFeriasNoMes(p,estado.ano,estado.mes);
      const aberto=estado.feriasAberta===p.id;
      const wrap=document.createElement("div"); wrap.className="perito-wrap"+(aberto?" aberto":"");

      const row=document.createElement("div"); row.className="perito";
      row.innerHTML='<span class="dot '+p.grupo+'"></span>'+
        '<input class="nome-edit" value="'+escapar(p.nome)+'" aria-label="Nome" maxlength="80"'+(ed?"":" readonly")+'>'+
        '<select class="grp-edit" aria-label="Grupo"'+(ed?"":" disabled")+'>'+GRUPOS.map(g=>'<option value="'+g+'"'+(g===p.grupo?" selected":"")+'>'+g+'</option>').join("")+'</select>'+
        '<span class="pcont" title="Plantões do grupo no mês">'+nplant+' <small>pl</small></span>'+
        '<button class="fer'+(temFer?" tem":"")+'" aria-label="Férias e afastamentos" aria-expanded="'+aberto+'" title="Férias e afastamentos">'+FER_ICON+'</button>'+
        (ed?'<button class="del" aria-label="Remover" title="Remover perito"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4l.5 9a1 1 0 001 .9h3a1 1 0 001-.9L12 4"/></svg></button>':'<span></span>');
      const nomeInp=row.querySelector(".nome-edit");
      const salvar=()=>{ if(!ed) return; const v=nomeInp.value.trim().slice(0,80); if(v&&v!==p.nome){ p.nome=v; persistir(); render(); } else if(!v){ nomeInp.value=p.nome; } };
      nomeInp.addEventListener("blur",salvar);
      nomeInp.addEventListener("keydown",e=>{ if(e.key==="Enter") nomeInp.blur(); if(e.key==="Escape"){ nomeInp.value=p.nome; nomeInp.blur(); } });
      row.querySelector(".grp-edit").addEventListener("change",e=>{ if(!ed) return; p.grupo=e.target.value; persistir(); render(); });
      row.querySelector(".fer").addEventListener("click",()=>{ estado.feriasAberta=aberto?null:p.id; renderLista(); });
      if(ed) row.querySelector(".del").addEventListener("click",()=>removerPerito(p.id));
      wrap.appendChild(row);

      if(aberto){
        const panel=document.createElement("div"); panel.className="ferias-panel";
        const periodos=(p.ferias||[]).slice().sort((a,b)=>(a.ini||"").localeCompare(b.ini||""));
        let ph;
        if(periodos.length){
          ph='<div class="fer-periodos">'+periodos.map((f,idx)=>'<div class="fer-item"><span class="rng">'+fmtData(f.ini)+' — '+fmtData(f.fim)+'</span><span class="ftipo">'+escapar(TIPOS_AFAST[f.tipo]||"Férias")+'</span>'+(ed?'<button data-idx="'+idx+'" class="fer-rm" aria-label="Remover período" title="Remover período">✕</button>':'')+'</div>').join("")+'</div>';
        }else{
          ph='<div class="fer-vazio">Nenhum período de férias ou afastamento cadastrado.</div>';
        }
        const dgf=diasGrupoEmFerias(p,estado.ano,estado.mes);
        const resumo = temFer ? '<div class="fer-resumo">Neste mês: '+dgf+' plantão(ões) em afastamento · cota '+cotaPerito(p,estado.ano,estado.mes)+' → '+cotaEfetiva(p,estado.ano,estado.mes)+'</div>' : '';
        panel.innerHTML=ph+(ed?'<div class="fer-add"><select class="fer-tipo" aria-label="Tipo">'+Object.keys(TIPOS_AFAST).map(k=>'<option value="'+k+'">'+TIPOS_AFAST[k]+'</option>').join("")+'</select><input type="date" class="fer-ini" aria-label="Início"><span style="color:var(--tinta-3)">→</span><input type="date" class="fer-fim" aria-label="Fim"><button class="btn-sm solid fer-add-btn">Adicionar</button></div>':'')+resumo;
        panel.querySelectorAll(".fer-rm").forEach(b=>b.addEventListener("click",()=>{
          const alvo=periodos[+b.dataset.idx];
          p.ferias=(p.ferias||[]).filter(x=>x!==alvo); persistir(); render();
        }));
        if(ed){
          const ini=panel.querySelector(".fer-ini"), fim=panel.querySelector(".fer-fim");
          ini.addEventListener("change",()=>{ if(ini.value&&(!fim.value||fim.value<ini.value)) fim.value=ini.value; });
          panel.querySelector(".fer-add-btn").addEventListener("click",()=>{
            if(!ini.value||!fim.value){ toast("Informe início e fim do período."); return; }
            if(fim.value<ini.value){ toast("A data final deve ser igual ou posterior à inicial."); return; }
            if(!p.ferias) p.ferias=[];
            p.ferias.push({ini:ini.value,fim:fim.value,tipo:panel.querySelector(".fer-tipo").value}); persistir(); render();
          });
        }
        wrap.appendChild(panel);
      }
      lista.appendChild(wrap);
    });
  }

  async function removerPerito(id){
    const p=peritoPorId(id); if(!p) return;
    let nDias=0; Object.keys(estado.extra).forEach(k=>Object.keys(estado.extra[k]).forEach(d=>{ if(estado.extra[k][d].includes(id)) nDias++; }));
    const ok=await confirmar("Remover perito",
      '<p>Remover <b>'+escapar(p.nome)+'</b> do cadastro?</p>'+(nDias?'<p>Ele também sai de <b>'+plural(nDias,"dia")+'</b> já lançados na escala extraoficial e das equipes de que participa.</p>':'')+'<p class="hint">Dá para voltar atrás com <b>Desfazer</b>.</p>',
      "Remover", true);
    if(!ok) return;
    estado.peritos=estado.peritos.filter(x=>x.id!==id);
    estado.equipes.forEach(e=>{ e.membros=e.membros.filter(m=>m!==id); });
    estado.equipes=estado.equipes.filter(e=>e.membros.length>=1);
    Object.keys(estado.extra).forEach(k=>Object.keys(estado.extra[k]).forEach(d=>{
      const [a,m]=k.split("-").map(Number); setOcupantes(+d,estado.extra[k][d].filter(x=>x!==id),a,m);
    }));
    if(estado.pincel&&estado.pincel.ref===id) estado.pincel=null;
    if(estado.destaque===id) estado.destaque=null;
    persistir(); render();
    toast(p.nome+" removido.",{rotulo:"Desfazer",fn:desfazer});
  }

  function renderDestaque(){
    const ord=ordenarPeritos(estado.peritos);
    const opts='<option value="">Destacar perito…</option>'+ord.map(p=>'<option value="'+escapar(p.id)+'"'+(estado.destaque===p.id?" selected":"")+'>'+escapar(p.nome)+' ('+p.grupo+')</option>').join("");
    document.querySelectorAll(".destaque-sel").forEach(s=>{ s.innerHTML=opts; s.disabled=!ord.length; });
    document.querySelectorAll(".ics-btn").forEach(b=>{
      const proposta=b.dataset.aba==="extra"&&visaoAtiva();
      b.disabled=!estado.destaque||proposta;
      b.title=proposta?"A agenda só pode ser baixada da escala definitiva":(b.dataset.aba==="oficial"?"Baixar agenda do perito (.ics) — próximos 12 meses":"Baixar agenda do perito (.ics) deste mês");
    });
  }
  function setDestaque(id){ estado.destaque=id||null; salvarPrefs(); renderDestaque(); renderCalendario(); renderTabelaOficial(); renderCalExtra(); renderTabelaExtra(); }

  function renderCalendario(){
    const grid=document.getElementById("grid"); grid.innerHTML="";
    const dp=estado.destaque?peritoPorId(estado.destaque):null;
    grid.classList.toggle("com-destaque",!!dp);
    const nd=diasNoMes(estado.ano,estado.mes), off=diaDaSemana(estado.ano,estado.mes,1);
    for(let i=0;i<off;i++){ const e=document.createElement("div"); e.className="cell empty"; grid.appendChild(e); }
    for(let d=1;d<=nd;d++){
      const g=grupoDoDia(estado.ano,estado.mes,d), dw=diaDaSemana(estado.ano,estado.mes,d), fds=(dw===0||dw===6);
      const fnome=feriadoNome(estado.ano,estado.mes,d);
      const ps=ordenarPeritos(peritosDoGrupo(g));
      const cell=document.createElement("div"); cell.className="cell "+g+(fds?" weekend":"")+(fnome?" feriado":"")+(ehHoje(estado.ano,estado.mes,d)?" hoje":"")+(dp&&dp.grupo===g?" hl":"");
      const nh=ps.length?ps.map(p=>spanNome(p,d,true)).join(""):'<span class="none">sem peritos</span>';
      const wkLine = fnome ? '<span class="wk fer-dia" title="'+escapar(fnome)+'">'+DOW[dw]+' · '+escapar(fnome)+'</span>' : '<span class="wk">'+DOW[dw]+'</span>';
      cell.innerHTML='<div class="dnum"><span class="n">'+d+'</span><span class="gbadge">'+g+'</span></div>'+wkLine+'<div class="names">'+nh+'</div>';
      cell.title=DOW_FULL[dw]+", "+d+" · Grupo "+g+(fnome?" · "+fnome:"")+(ps.length?"\n"+ps.map(p=>p.nome+(diaEmFerias(p,estado.ano,estado.mes,d)?" (afastado)":"")).join("\n"):"");
      grid.appendChild(cell);
    }
  }

  function renderTabelaOficial(){
    const tb=document.getElementById("tbodyOficial"); tb.innerHTML="";
    const dp=estado.destaque?peritoPorId(estado.destaque):null;
    tb.parentElement.classList.toggle("com-destaque",!!dp);
    const nd=diasNoMes(estado.ano,estado.mes);
    for(let d=1;d<=nd;d++){
      const g=grupoDoDia(estado.ano,estado.mes,d), dw=diaDaSemana(estado.ano,estado.mes,d), fds=(dw===0||dw===6);
      const fnome=feriadoNome(estado.ano,estado.mes,d);
      const ps=ordenarPeritos(peritosDoGrupo(g));
      const nomes = ps.length ? ps.map(p=>spanNome(p,d,false)).join(", ") : '<span style="color:var(--tinta-3)">sem peritos</span>';
      const vw = DOW_FULL[dw] + (fnome?'<span class="fer-tag">'+escapar(fnome)+'</span>':'');
      const tr=document.createElement("tr"); tr.className=[fds?"wknd":"",fnome?"feriado":"",ehHoje(estado.ano,estado.mes,d)?"hoje":"",dp&&dp.grupo===g?"hl":""].filter(Boolean).join(" ");
      tr.innerHTML='<td class="vd">'+d+'</td><td class="vw">'+vw+'</td><td class="vp '+g+'">'+nomes+'</td>';
      tb.appendChild(tr);
    }
  }

  function renderTabelaExtra(){
    const tb=document.getElementById("tbodyExtra"); tb.innerHTML="";
    const nd=diasNoMes(estado.ano,estado.mes), fechado=!editavelAgora(), dif=diasDiferentes();
    tb.parentElement.classList.toggle("com-destaque",!!estado.destaque);
    for(let d=1;d<=nd;d++){
      const dw=diaDaSemana(estado.ano,estado.mes,d), fds=(dw===0||dw===6);
      const fnome=feriadoNome(estado.ano,estado.mes,d);
      const oc=ocupantesDoDia(d), cor=corDoDia(d);
      let cell, cls="vp", style="";
      if(oc.length){
        cell=oc.map(id=>{ const p=peritoPorId(id); return p?spanNome(p,d,false):"?"; }).join(", ");
        cls+=" tem-cor"; style='--cor:'+cor;
      }else{
        cell='<span style="color:var(--tinta-3)">livre</span>';
      }
      const vw = DOW_FULL[dw] + (fnome?'<span class="fer-tag">'+escapar(fnome)+'</span>':'');
      const tr=document.createElement("tr"); tr.className=[fds?"wknd":"",fnome?"feriado":"",fechado?"":"vt-click",ehHoje(estado.ano,estado.mes,d)?"hoje":"",estado.destaque&&oc.includes(estado.destaque)?"hl":"",dif.has(d)?"dif":""].filter(Boolean).join(" ");
      tr.innerHTML='<td class="vd">'+d+'</td><td class="vw">'+vw+'</td><td class="'+cls+'" style="'+style+'">'+cell+'</td>';
      if(!fechado) tr.addEventListener("click",()=>cliqueDia(d));
      tb.appendChild(tr);
    }
  }

  function aplicarView(aba){
    const modo = aba==="oficial" ? estado.viewOficial : estado.viewExtra;
    const grade = document.getElementById(aba==="oficial"?"viewOficialGrade":"viewExtraGrade");
    const lista = document.getElementById(aba==="oficial"?"viewOficialLista":"viewExtraLista");
    const tog = document.getElementById(aba==="oficial"?"vtogOficial":"vtogExtra");
    if(grade) grade.hidden = modo!=="grade";
    if(lista) lista.hidden = modo!=="lista";
    if(tog) tog.querySelectorAll(".vt-btn").forEach(b=>{ b.classList.toggle("active", b.dataset.v===modo); b.setAttribute("aria-pressed", b.dataset.v===modo); });
  }

  function setView(aba, modo){
    if(aba==="oficial") estado.viewOficial=modo; else estado.viewExtra=modo;
    aplicarView(aba); salvarPrefs();
  }

  function imprimir(aba){
    const wrap=document.getElementById(aba==="oficial"?"viewOficialLista":"viewExtraLista");
    const table=wrap?wrap.querySelector("table"):null;
    if(!table) return;
    const pa=document.getElementById("printArea"); pa.innerHTML="";
    const h=document.createElement("div"); h.className="print-title"; h.textContent=tituloEscala(aba);
    const copia=table.cloneNode(true); copia.classList.remove("com-destaque");
    pa.appendChild(h); pa.appendChild(copia);
    window.print();
  }

  // --- Exportar imagem (PNG) ---
  function hexAlpha(hex,a){ const h=hex.replace("#",""); return "rgba("+parseInt(h.slice(0,2),16)+","+parseInt(h.slice(2,4),16)+","+parseInt(h.slice(4,6),16)+","+a+")"; }
  function ajustaTexto(ctx,txt,maxW){ if(ctx.measureText(txt).width<=maxW) return txt; let s=txt; while(s.length>1&&ctx.measureText(s+"…").width>maxW) s=s.slice(0,-1); return s+"…"; }
  function dadosDiaImg(aba,d){
    const ano=estado.ano, mes=estado.mes;
    if(aba==="oficial"){
      const g=grupoDoDia(ano,mes,d), ps=ordenarPeritos(peritosDoGrupo(g));
      if(!ps.length) return {cor:null, proposta:"sem peritos", vazio:true};
      return {cor:GRUPO_COR[g], proposta:ps.map(p=>p.nome).join(", "), vazio:false};
    }
    const oc=ocupantesDoDia(d);
    if(oc.length) return {cor:corDoDia(d), proposta:oc.map(id=>nomePessoa(id)).join(", "), vazio:false};
    return {cor:null, proposta:"livre", vazio:true};
  }
  function baixar(blob,nome){ const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function exportarImagem(aba){
    const ano=estado.ano, mes=estado.mes, nd=diasNoMes(ano,mes);
    const W=720, margem=22, wData=52, xData=margem, xDia=xData+wData+8, wDia=170, xProp=xDia+wDia+8, wProp=W-margem-xProp;
    const yTitulo=30, yHeader=58, yStart=70, rowH=28, H=yStart+nd*rowH+16, scale=2;
    const cv=document.createElement("canvas"); cv.width=W*scale; cv.height=H*scale;
    const ctx=cv.getContext("2d"); ctx.scale(scale,scale);
    ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,W,H);
    // título
    ctx.fillStyle="#111418"; ctx.font="600 17px 'Segoe UI',Arial,sans-serif"; ctx.textBaseline="alphabetic"; ctx.textAlign="left";
    ctx.fillText(tituloEscala(aba), margem, yTitulo);
    // cabeçalho de colunas
    ctx.font="600 10px 'Segoe UI',Arial,sans-serif"; ctx.fillStyle="#586271";
    ctx.textAlign="center"; ctx.fillText("DATA", xData+wData/2, yHeader);
    ctx.textAlign="left"; ctx.fillText("DIA", xDia, yHeader); ctx.fillText("PROPOSTA", xProp, yHeader);
    ctx.strokeStyle="#c5ccd6"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(margem,yHeader+6); ctx.lineTo(W-margem,yHeader+6); ctx.stroke();
    // linhas
    for(let i=0;i<nd;i++){
      const d=i+1, y=yStart+i*rowH, dw=diaDaSemana(ano,mes,d), fds=(dw===0||dw===6), fnome=feriadoNome(ano,mes,d), dd=dadosDiaImg(aba,d);
      if(fds){ ctx.fillStyle="#faf7f2"; ctx.fillRect(margem,y,W-2*margem,rowH); }
      if(dd.cor){ ctx.fillStyle=hexAlpha(dd.cor,0.12); ctx.fillRect(xProp-7,y,wProp+9,rowH); }
      ctx.strokeStyle="#ececec"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(margem,y+rowH); ctx.lineTo(W-margem,y+rowH); ctx.stroke();
      ctx.textBaseline="middle";
      ctx.fillStyle=fnome?"#9E2A4E":(fds?"#A85532":"#152238"); ctx.font="600 13px monospace"; ctx.textAlign="center";
      ctx.fillText(String(d), xData+wData/2, y+rowH/2);
      ctx.textAlign="left";
      if(fnome){
        ctx.fillStyle="#586271"; ctx.font="12px 'Segoe UI',Arial,sans-serif"; ctx.fillText(DOW_FULL[dw], xDia, y+rowH/2-5);
        ctx.fillStyle="#9E2A4E"; ctx.font="600 9px 'Segoe UI',Arial,sans-serif"; ctx.fillText(ajustaTexto(ctx,fnome,wDia-4), xDia, y+rowH/2+8);
      }else{
        ctx.fillStyle="#586271"; ctx.font="12px 'Segoe UI',Arial,sans-serif"; ctx.fillText(DOW_FULL[dw], xDia, y+rowH/2);
      }
      ctx.fillStyle=dd.cor||"#8A93A1"; ctx.font=(dd.vazio?"italic ":"")+"12px 'Segoe UI',Arial,sans-serif";
      ctx.fillText(ajustaTexto(ctx, dd.proposta, wProp-6), xProp, y+rowH/2);
    }
    ctx.strokeStyle="#dbe0e7"; ctx.lineWidth=1; ctx.strokeRect(margem+.5, yStart+.5, W-2*margem-1, nd*rowH);
    cv.toBlob(b=>{ baixar(b,"escala-"+aba+"-"+ano+"-"+_pad2(mes)+".png"); toast("Imagem exportada (PNG)."); }, "image/png");
  }

  // --- Agenda (.ics) do perito destacado: importável no Google Agenda, Outlook e celular ---
  function icsTexto(s){ return String(s).replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n"); }
  function icsDobrar(linha){ // linhas de no máximo 75 octetos (RFC 5545)
    const enc=new TextEncoder(); if(enc.encode(linha).length<=75) return linha;
    const partes=[]; let atual="";
    for(const ch of linha){ if(enc.encode(atual+ch).length>(partes.length?74:75)){ partes.push(atual); atual=ch; } else atual+=ch; }
    partes.push(atual); return partes.join("\r\n ");
  }
  function icsData(ms){ const d=new Date(ms); return d.getUTCFullYear()+_pad2(d.getUTCMonth()+1)+_pad2(d.getUTCDate())+"T"+_pad2(d.getUTCHours())+_pad2(d.getUTCMinutes())+"00Z"; }
  function exportarICS(aba){
    const p=peritoPorId(estado.destaque); if(!p) return;
    if(aba==="extra"&&visaoAtiva()){ toast("A agenda só pode ser baixada da escala definitiva."); return; }
    const [hh,mm]=estado.config.horaInicio.split(":").map(Number);
    const eventos=[];
    if(aba==="oficial"){
      let a=estado.ano, m=estado.mes;
      for(let i=0;i<12&&!antesDe(LIM_SUP.ano,LIM_SUP.mes,a,m);i++){
        diasDoGrupo(p.grupo,a,m).forEach(d=>{ if(!diaEmFerias(p,a,m,d)) eventos.push({a,m,d,desc:"Grupo "+p.grupo+" · "+peritosDoGrupo(p.grupo).map(x=>x.nome).join(", ")}); });
        m++; if(m>12){ m=1; a++; }
      }
    }else{
      const ex=extraDoMes();
      Object.keys(ex).map(Number).sort((x,y)=>x-y).forEach(d=>{ if(ex[d].includes(p.id)&&!diaEmFerias(p,estado.ano,estado.mes,d)) eventos.push({a:estado.ano,m:estado.mes,d,desc:"Equipe: "+ex[d].map(id=>nomePessoa(id)).join(", ")}); });
    }
    if(!eventos.length){ toast("Nenhum plantão de "+primeiroNome(p.nome)+" para exportar."); return; }
    const agora=icsData(Date.now()), rotulo=aba==="oficial"?"oficial":"extraoficial";
    const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Escala NPF//Escala de Plantoes//PT-BR","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:"+icsTexto("Plantões ("+rotulo+") — "+p.nome),"X-WR-TIMEZONE:America/Bahia"];
    eventos.forEach(ev=>{
      const ini=Date.UTC(ev.a,ev.m-1,ev.d,hh+FUSO_BAHIA_H,mm), fer=feriadoNome(ev.a,ev.m,ev.d);
      L.push("BEGIN:VEVENT","UID:"+p.id+"-"+rotulo+"-"+isoDia(ev.a,ev.m,ev.d).replace(/-/g,"")+"@escala-npf","DTSTAMP:"+agora,"DTSTART:"+icsData(ini),"DTEND:"+icsData(ini+86400000),
        "SUMMARY:"+icsTexto("Plantão "+rotulo+(fer?" · "+fer:"")),"DESCRIPTION:"+icsTexto(ev.desc),"TRANSP:OPAQUE","END:VEVENT");
    });
    L.push("END:VCALENDAR");
    const nome="agenda-"+rotulo+"-"+primeiroNome(p.nome).normalize("NFD").replace(/[^\w-]/g,"").toLowerCase()+"-"+estado.ano+"-"+_pad2(estado.mes)+".ics";
    baixar(new Blob([L.map(icsDobrar).join("\r\n")+"\r\n"],{type:"text/calendar;charset=utf-8"}),nome);
    toast(plural(eventos.length,"plantão","plantões")+" exportados. Abra o arquivo para adicionar à sua agenda.");
  }

  function renderExtra(){
    renderMembroPick();
    renderEquipes();
    renderAvulso();
    renderValidacao();
    renderToolbar();
    renderLockBar();
    renderCalExtra();
    renderTabelaExtra();
    aplicarView("extra");
    renderEquidade();
    document.getElementById("totalEquipes").textContent=plural(equipesEf().length,"equipe");
    avisarRender();
  }
  function avisarRender(){ ganchosRender.forEach(cb=>{ try{ cb(); }catch(e){ console.error(e); } }); }

  function refreshExtra(){
    renderEquipes();
    renderAvulso();
    renderValidacao();
    renderEquidade();
    renderCalExtra();
    renderTabelaExtra();
    aplicarView("extra");
    avisarRender();
  }

  // Fins de semana e feriados por perito (no mês e no ano), para distribuir de forma justa.
  function contagensEquidade(){
    const r={}; estado.peritos.forEach(p=>r[p.id]={fdsMes:0,ferMes:0,fdsAno:0,ferAno:0});
    todosMapas().forEach(({k,m:mesObj})=>{
      const [a,m]=k.split("-").map(Number); if(a!==estado.ano) return;
      Object.keys(mesObj).forEach(ds=>{
        const d=+ds, dw=diaDaSemana(a,m,d), fds=dw===0||dw===6, fer=!!feriadoNome(a,m,d);
        if(!fds&&!fer) return;
        (mesObj[ds]||[]).forEach(pid=>{ const p=peritoPorId(pid), c=r[pid]; if(!p||!c||diaEmFerias(p,a,m,d)) return;
          if(fds){ c.fdsAno++; if(m===estado.mes) c.fdsMes++; }
          if(fer){ c.ferAno++; if(m===estado.mes) c.ferMes++; }
        });
      });
    });
    return r;
  }
  function renderEquidade(){
    const tab=document.getElementById("equidadeTab"); tab.innerHTML="";
    document.getElementById("equidadeAno").textContent="fins de semana e feriados · "+estado.ano;
    if(!estado.peritos.length){ tab.innerHTML='<div class="vazio" style="padding:18px 16px">Sem peritos cadastrados.</div>'; return; }
    const c=contagensEquidade(), vals=Object.values(c);
    if(!vals.some(v=>v.fdsAno||v.ferAno)){ tab.innerHTML='<div class="vazio" style="padding:18px 16px"><div class="vt">Nada lançado em '+estado.ano+' ainda</div>A contagem de fins de semana e feriados aparece conforme você monta as escalas extraoficiais.</div>'; return; }
    const maxFds=Math.max(...vals.map(v=>v.fdsAno)), maxFer=Math.max(...vals.map(v=>v.ferAno));
    const minFds=Math.min(...vals.map(v=>v.fdsAno)), minFer=Math.min(...vals.map(v=>v.ferAno));
    const num=(n,max,min)=>'<span class="n'+(n===0?" zero":"")+(n===max&&max>min?" max":"")+'">'+n+'</span>';
    tab.innerHTML='<div class="eqgrp"><span></span><span></span><span>Fins de semana</span><span>Feriados</span></div>'+
      '<div class="eqhead"><span></span><span>Perito</span><span>mês</span><span>ano</span><span>mês</span><span>ano</span></div>';
    const ord=estado.peritos.slice().sort((a,b)=>{ const ca=c[a.id],cb=c[b.id]; return (cb.ferAno+cb.fdsAno)-(ca.ferAno+ca.fdsAno)||a.nome.localeCompare(b.nome,"pt"); });
    ord.forEach(p=>{
      const v=c[p.id];
      const row=document.createElement("div"); row.className="eqrow";
      row.innerHTML='<span class="vdot '+p.grupo+'"></span><span class="vnome" title="'+escapar(p.nome)+'">'+escapar(p.nome)+'</span>'+
        '<span class="n'+(v.fdsMes?"":" zero")+'">'+v.fdsMes+'</span>'+num(v.fdsAno,maxFds,minFds)+
        '<span class="n'+(v.ferMes?"":" zero")+'">'+v.ferMes+'</span>'+num(v.ferAno,maxFer,minFer);
      tab.appendChild(row);
    });
  }

  function renderMembroPick(){
    const box=document.getElementById("membroPick"); box.innerHTML="";
    if(!estado.peritos.length){ box.innerHTML='<div style="padding:10px;color:var(--tinta-3);font-size:13px">Cadastre peritos na aba Oficial primeiro.</div>'; return; }
    ordenarPeritos(estado.peritos).forEach(p=>{
      const lab=document.createElement("label"); lab.className="membro-opt";
      lab.innerHTML='<input type="checkbox" value="'+escapar(p.id)+'"><span class="pdot '+p.grupo+'"></span><span class="pn">'+escapar(p.nome)+'</span><span class="pg">'+p.grupo+'</span>';
      box.appendChild(lab);
    });
  }

  function renderEquipes(){
    const box=document.getElementById("eqLista"); box.innerHTML="";
    if(!equipesEf().length){ box.innerHTML='<div class="vazio"><div class="vt">Nenhuma equipe</div>Crie duplas ou trios acima para montar a escala — ou use o pincel avulso abaixo.</div>'; return; }
    const ex=extraDoMes();
    equipesEf().forEach(e=>{
      const nomes=e.membros.map(id=>nomePessoa(id));
      const diasMes=Object.keys(ex).filter(d=>Array.isArray(ex[d])&&mesmoConjunto(ex[d],e.membros)).map(Number);
      const tipo=e.membros.length===3?"Trio":(e.membros.length===2?"Dupla":"Solo");
      const ativa=estado.pincel&&estado.pincel.tipo==="equipe"&&estado.pincel.ref===e.id;
      const podeRemover=!visaoAtiva()||equipeLocalDaProposta(e);
      const div=document.createElement("div"); div.className="equipe"+(ativa?" ativa":""); div.style.borderLeftColor=e.cor;
      div.tabIndex=0; div.setAttribute("role","button"); div.setAttribute("aria-pressed",!!ativa);
      div.innerHTML='<div class="eh"><span class="enome"><span class="swatch" style="background:'+e.cor+'"></span>'+escapar(nomes.join(" + "))+'</span>'+
        (podeRemover?'<button class="mini-del" aria-label="Remover equipe" title="Remover equipe (mantém os dias já lançados)"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M3 4h10M5 4l.5 9a1 1 0 001 .9h3a1 1 0 001-.9L12 4M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1"/></svg></button>':'')+'</div>'+
        '<div class="edias">Dias no mês: '+compactaDias(diasMes)+'</div>'+
        '<div class="efoot"><span class="etipo">'+tipo+'</span>'+
        (equipeLocalDaProposta(e)?'<span class="rec-flag">só nesta proposta</span>':'')+(e.recorrente?'<span class="rec-flag">recorrente · '+compactaDias(e.diasPadrao||[])+'</span>':'')+
        '<span class="ecount">'+plural(diasMes.length,"dia")+'</span></div>';
      const ativar=()=>{ estado.pincel=ativa?null:{tipo:"equipe",ref:e.id}; atualizarSelecaoPincel(); };
      div.addEventListener("click",ev=>{ if(ev.target.closest(".mini-del")) return; ativar(); });
      div.addEventListener("keydown",ev=>{ if((ev.key==="Enter"||ev.key===" ")&&ev.target===div){ ev.preventDefault(); ativar(); } });
      const md=div.querySelector(".mini-del"); if(md) md.addEventListener("click",()=>removerEquipe(e.id));
      box.appendChild(div);
    });
  }

  function renderAvulso(){
    const box=document.getElementById("avulsoChips"); if(!box) return; box.innerHTML="";
    if(!estado.peritos.length){ box.innerHTML='<span style="font-size:12.5px;color:var(--tinta-3)">Cadastre peritos na aba Oficial para usar avulsos.</span>'; return; }
    ordenarPeritos(estado.peritos).forEach(p=>{
      const ativo=estado.pincel&&estado.pincel.tipo==="perito"&&estado.pincel.ref===p.id;
      const c=document.createElement("button"); c.type="button"; c.className="chip-p"+(ativo?" ativo":""); c.setAttribute("aria-pressed",!!ativo); c.title=p.nome;
      c.innerHTML='<span class="pdot '+p.grupo+'"></span>'+escapar(primeiroNome(p.nome));
      c.addEventListener("click",()=>{ estado.pincel=ativo?null:{tipo:"perito",ref:p.id}; atualizarSelecaoPincel(); });
      box.appendChild(c);
    });
    const bAtivo=estado.pincel&&estado.pincel.tipo==="borracha";
    const b=document.createElement("button"); b.type="button"; b.className="chip-borracha"+(bAtivo?" ativo":""); b.setAttribute("aria-pressed",!!bAtivo);
    b.innerHTML='<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 20H5l-2.5-2.5a2 2 0 010-2.8l9-9 7.3 7.3-9 9z"/><path d="M13 7.5l3.5 3.5"/></svg> Limpar dia';
    b.addEventListener("click",()=>{ estado.pincel=bAtivo?null:{tipo:"borracha"}; atualizarSelecaoPincel(); });
    box.appendChild(b);
  }

  function atualizarSelecaoPincel(){
    renderEquipes(); renderAvulso(); renderToolbar();
    document.getElementById("gridExtra").classList.toggle("pintando",!!estado.pincel&&editavelAgora());
  }

  function renderValidacao(){
    const res=document.getElementById("valRes"), tab=document.getElementById("valTab"), al=document.getElementById("alertas");
    res.innerHTML=""; tab.innerHTML=""; al.innerHTML=""; al.hidden=true;
    if(!estado.peritos.length){ tab.innerHTML='<div class="vazio">Sem peritos para conferir.</div>'; return; }
    const ex=extraDoMes(), nd=diasNoMes(estado.ano,estado.mes);
    const extraPorPerito={}, emAfast={}; estado.peritos.forEach(p=>{ extraPorPerito[p.id]=0; emAfast[p.id]=[]; });
    let diasAtribuidos=0;
    Object.keys(ex).forEach(d=>{ const oc=Array.isArray(ex[d])?ex[d]:[]; if(oc.length) diasAtribuidos++; oc.forEach(pid=>{ const p=peritoPorId(pid); if(!p||extraPorPerito[pid]==null) return; if(diaEmFerias(p,estado.ano,estado.mes,+d)) emAfast[pid].push(+d); else extraPorPerito[pid]++; }); });

    let batem=0;
    ordenarPeritos(estado.peritos).forEach(p=>{
      const cotaBruta=cotaPerito(p,estado.ano,estado.mes), cota=cotaEfetiva(p,estado.ano,estado.mes), ext=extraPorPerito[p.id]||0, dif=ext-cota;
      const fer=temFeriasNoMes(p,estado.ano,estado.mes);
      if(dif===0) batem++;
      const st = dif===0 ? '<span class="vstatus ok">bate</span>' : (dif>0 ? '<span class="vstatus bad">sobra '+dif+'</span>' : '<span class="vstatus bad">falta '+(-dif)+'</span>');
      const cotaCell = (fer&&cota!==cotaBruta) ? (cota+'<small style="color:var(--tinta-3)"> de '+cotaBruta+'</small>') : (''+cota);
      const ferIcon = fer ? '<span class="vfer" title="Com férias/afastamento neste mês">'+FER_ICON+'</span>' : '';
      const row=document.createElement("div"); row.className="valrow";
      row.innerHTML='<span class="vdot '+p.grupo+'"></span><span class="vnome" title="'+escapar(p.nome)+'">'+escapar(p.nome)+ferIcon+'</span><span class="vnum">'+cotaCell+'</span><span class="vnum">'+ext+'</span>'+st;
      tab.appendChild(row);
    });

    const semEquipe=nd-diasAtribuidos;
    const nFer=estado.peritos.filter(p=>temFeriasNoMes(p,estado.ano,estado.mes)).length;
    const todosBatem=batem===estado.peritos.length;
    res.innerHTML=
      '<span class="chip '+(todosBatem?"ok":"warn")+'">'+(todosBatem?"✓ ":"")+batem+'/'+estado.peritos.length+' batem a cota</span>'+
      '<span class="chip '+(semEquipe===0?"ok":"neutral")+'">'+semEquipe+' dia'+(semEquipe===1?"":"s")+' livre'+(semEquipe===1?"":"s")+'</span>'+
      (nFer?'<span class="chip neutral"><span class="cfer">'+FER_ICON+'</span> '+nFer+' com afastamento</span>':'');

    // alertas detalhados
    const linhas=[];
    estado.peritos.forEach(p=>{ if(emAfast[p.id].length){ const tipos=[...new Set(emAfast[p.id].map(d=>TIPOS_AFAST[afastamentoNoDia(p,estado.ano,estado.mes,d).tipo]))].join("/"); linhas.push('<div class="alerta erro">'+ALERTA_ICON+'<span><b>'+escapar(p.nome)+'</b> está escalado em '+tipos.toLowerCase()+' nos dias <span class="mono">'+compactaDias(emAfast[p.id])+'</span> — esses dias não contam na cota.</span></div>'); } });
    if(semEquipe>0&&semEquipe<nd){ const livres=[]; for(let d=1;d<=nd;d++) if(!ocupantesDoDia(d).length) livres.push(d); linhas.push('<div class="alerta aviso">'+INFO_ICON+'<span>Dias sem ninguém escalado: <span class="mono">'+compactaDias(livres)+'</span></span></div>'); }
    if(linhas.length){ al.innerHTML=linhas.join(""); al.hidden=false; }
  }

  function renderToolbar(){
    const pint=document.getElementById("pintando");
    const pc=estado.pincel;
    if(!pc){ pint.innerHTML='<span class="nenhuma">Escolha uma equipe ou um perito ao lado para montar os dias</span>'; return; }
    if(pc.tipo==="borracha"){ pint.innerHTML='<span class="sw" style="background:var(--neutro)"></span>Borracha — clique ou arraste sobre os dias para limpar'; return; }
    if(pc.tipo==="equipe"){ const e=equipePorId(pc.ref); if(!e){ pint.innerHTML=""; return; } const nomes=e.membros.map(id=>nomePessoa(id,true)).join(" + "); pint.innerHTML='<span class="sw" style="background:'+e.cor+'"></span>Pintando: <b>'+escapar(nomes)+'</b> — clique ou arraste sobre os dias'; return; }
    if(pc.tipo==="perito"){ const p=peritoPorId(pc.ref); if(!p){ pint.innerHTML=""; return; } pint.innerHTML='<span class="sw" style="background:var(--neutro)"></span>Avulso: <b>'+escapar(primeiroNome(p.nome))+'</b> — clique para adicionar/remover do dia'; return; }
  }

  function renderLockBar(){
    const ed=editavelAgora(), proposta=visaoAtiva(), fechado=mesFechado(estado.ano,estado.mes);
    const bar=document.getElementById("lockBar"), txt=document.getElementById("lockTxt"), btn=document.getElementById("lockBtn"), pb=document.getElementById("propMesBtn");
    bar.hidden=proposta;                                   // com proposta aberta, quem fala é a barra da proposta
    bar.classList.toggle("locked",fechado);
    if(ehEditorDef()){
      btn.hidden=false;
      if(fechado){ txt.innerHTML='<b>Mês concluído</b> — edição bloqueada.'; btn.textContent="Reabrir mês"; }
      else{ txt.textContent="Mês aberto para edição."; btn.textContent="Marcar como concluído"; }
    }else{
      btn.hidden=true;
      txt.innerHTML=fechado?'<b>✓ Escala definitiva</b> — mês fechado pelo administrador.':'<b>Em montagem</b> — o administrador ainda não fechou este mês; a escala pode mudar.';
    }
    pb.hidden=!(estado.papel==="colaborador"&&!estado.visao&&!fechado);
    // ferramentas de montagem só aparecem quando há o que editar
    document.querySelector(".p-equipes").hidden=!ed;
    document.getElementById("toolbar").hidden=!ed;
    document.getElementById("ferrEdicao").hidden=!ed;
    document.querySelector(".rec-row").hidden=proposta;     // "acordo base" é da escala definitiva
    if(proposta) document.getElementById("padraoWrap").hidden=true;
    ["quickDias","quickBtn","acordoBtn","copiarBtn","limparBtn"].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled=!ed; });
  }

  function celulaExtra(d,fechado){
    const dw=diaDaSemana(estado.ano,estado.mes,d), fds=(dw===0||dw===6);
    const fnome=feriadoNome(estado.ano,estado.mes,d);
    const oc=ocupantesDoDia(d), cor=corDoDia(d);
    const marcaDif=visaoAtiva()&&!mesmoConjunto(((estado.extra[chaveMes()]||{})[d])||[],oc);
    const btn=document.createElement("button"); btn.type="button"; btn.dataset.dia=d; btn.disabled=fechado;
    btn.className="cellx"+(marcaDif?" dif":"")+(fds?" weekend":"")+(fnome?" feriado":"")+(oc.length?" tem-cor":"")+(ehHoje(estado.ano,estado.mes,d)?" hoje":"")+(estado.destaque&&oc.includes(estado.destaque)?" hl":"");
    let corpo="";
    if(oc.length){
      btn.style.setProperty("--cor",cor);
      const membrosHtml=oc.map(id=>{ const p=peritoPorId(id); return p?spanNome(p,d,true):'<span>?</span>'; }).join("");
      const algumAfastado=oc.some(id=>diaEmFerias(peritoPorId(id),estado.ano,estado.mes,d));
      corpo='<div class="xnames">'+membrosHtml+'</div><span class="xtag" style="background:'+cor+'"></span>'+(algumAfastado?'<span class="xalerta" title="Perito escalado durante afastamento">'+ALERTA_ICON+'</span>':'');
    }else{
      corpo='<span class="xsem">livre</span>';
    }
    const wkLine = fnome ? '<span class="wk fer-dia" title="'+escapar(fnome)+'">'+DOW[dw]+' · '+escapar(fnome)+'</span>' : '<span class="wk">'+DOW[dw]+'</span>';
    btn.innerHTML='<div class="dnum"><span class="n">'+d+'</span>'+wkLine+'</div>'+corpo;
    btn.setAttribute("aria-label",d+" de "+MESES[estado.mes-1]+", "+DOW_FULL[dw]+(fnome?", "+fnome:"")+": "+(oc.length?oc.map(id=>nomePessoa(id)).join(", "):"livre"));
    return btn;
  }
  function renderCalExtra(){
    const grid=document.getElementById("gridExtra"); grid.innerHTML="";
    const nd=diasNoMes(estado.ano,estado.mes), off=diaDaSemana(estado.ano,estado.mes,1), fechado=!editavelAgora();
    grid.classList.toggle("pintando",!!estado.pincel&&!fechado);
    grid.classList.toggle("com-destaque",!!estado.destaque);
    for(let i=0;i<off;i++){ const e=document.createElement("div"); e.className="cell empty"; grid.appendChild(e); }
    for(let d=1;d<=nd;d++) grid.appendChild(celulaExtra(d,fechado));
  }
  function atualizarCelulaExtra(d){
    const velha=document.querySelector('#gridExtra .cellx[data-dia="'+d+'"]');
    if(velha) velha.replaceWith(celulaExtra(d,!editavelAgora()));
  }

  // --- Pincel: clique em um dia ou arraste sobre vários (mouse ou toque) ---
  let pintura=null; // {modo, dias:Set}
  function modoPintura(d){
    const pc=estado.pincel, oc=ocupantesDoDia(d);
    if(pc.tipo==="borracha") return "limpar";
    if(pc.tipo==="equipe"){ const eq=equipePorId(pc.ref); if(!eq) return null; return mesmoConjunto(oc,eq.membros)?"tirar-equipe":"equipe"; }
    if(pc.tipo==="perito") return oc.includes(pc.ref)?"tirar":"por";
    return null;
  }
  function pintarDia(modo,d){
    const pc=estado.pincel, oc=ocupantesDoDia(d);
    if(modo==="limpar") setOcupantes(d,[]);
    else if(modo==="equipe"){ const eq=equipePorId(pc.ref); if(eq) setOcupantes(d,eq.membros.slice()); }
    else if(modo==="tirar-equipe"){ const eq=equipePorId(pc.ref); if(eq&&mesmoConjunto(oc,eq.membros)) setOcupantes(d,[]); }
    else if(modo==="por"){ if(!oc.includes(pc.ref)) setOcupantes(d,oc.concat(pc.ref)); }
    else if(modo==="tirar") setOcupantes(d,oc.filter(x=>x!==pc.ref));
  }
  function iniciarPintura(d){
    if(!editavelAgora()) return false;
    if(!estado.pincel){ toast("Escolha uma equipe, um perito ou a borracha ao lado."); return false; }
    const modo=modoPintura(d); if(!modo) return false;
    pintura={modo, dias:new Set([d])};
    pintarDia(modo,d); atualizarCelulaExtra(d);
    return true;
  }
  function finalizarPintura(){ if(!pintura) return; pintura=null; persistir(); refreshExtra(); }
  function cliqueDia(d){ if(iniciarPintura(d)) finalizarPintura(); }
  function ligarPintura(){
    const grid=document.getElementById("gridExtra");
    grid.addEventListener("pointerdown",ev=>{
      const c=ev.target.closest(".cellx[data-dia]"); if(!c||c.disabled||ev.button>0||!estado.pincel) return; // sem pincel: deixa rolar a página no celular
      ev.preventDefault();
      if(c.hasPointerCapture&&c.hasPointerCapture(ev.pointerId)) c.releasePointerCapture(ev.pointerId);
      iniciarPintura(+c.dataset.dia);
    });
    // Enter/Espaço em uma célula em foco gera "click": só nesse caso o clique pinta (mouse e toque já pintaram no pointerdown).
    // Não dá para usar click.detail===0 para reconhecer o teclado: alguns aparelhos de toque também enviam detail=0.
    let porTeclado=false;
    grid.addEventListener("keydown",ev=>{ if(ev.key==="Enter"||ev.key===" ") porTeclado=true; });
    grid.addEventListener("keyup",()=>{ setTimeout(()=>{ porTeclado=false; },0); });
    grid.addEventListener("click",ev=>{
      const c=ev.target.closest(".cellx[data-dia]"); if(!c) return;
      if(porTeclado) cliqueDia(+c.dataset.dia);
      else if(!estado.pincel) toast("Escolha uma equipe, um perito ou a borracha ao lado.");
    });
    document.addEventListener("pointermove",ev=>{
      if(!pintura) return;
      const el=document.elementFromPoint(ev.clientX,ev.clientY), c=el&&el.closest("#gridExtra .cellx[data-dia]");
      if(!c) return; const d=+c.dataset.dia; if(pintura.dias.has(d)) return;
      pintura.dias.add(d); pintarDia(pintura.modo,d); atualizarCelulaExtra(d);
    });
    document.addEventListener("pointerup",finalizarPintura);
    document.addEventListener("pointercancel",finalizarPintura);
  }

  // ---------- Ações de equipe ----------
  function criarEquipe(){
    if(!(visaoAtiva()?estado.visao.modo==="editar":ehEditorDef())) return;
    const ids=[...document.querySelectorAll('#membroPick input:checked')].map(i=>i.value);
    if(ids.length<1){ toast("Selecione ao menos 1 perito."); return; }
    if(ids.length>3){ toast("No máximo 3 peritos por equipe."); return; }
    const todas=equipesEf();
    if(todas.some(e=>mesmoConjunto(e.membros,ids))){ toast("Já existe uma equipe com esses peritos."); return; }
    const naProposta=visaoAtiva();
    const rec=!naProposta&&document.getElementById("recCheck").checked;
    const diasPadrao=rec?parseDias(document.getElementById("padraoInput").value,31):[];
    const usadas=new Set(todas.map(e=>e.cor));
    const cor=CORES_EQUIPE.find(c=>!usadas.has(c))||CORES_EQUIPE[todas.length%CORES_EQUIPE.length];
    const eq={id:uid(),membros:ids,cor,recorrente:rec,diasPadrao};
    if(naProposta) estado.prop.equipes.push(eq); else estado.equipes.push(eq);
    estado.pincel={tipo:"equipe",ref:eq.id};
    document.querySelectorAll('#membroPick input:checked').forEach(i=>i.checked=false);
    document.getElementById("recCheck").checked=false;
    document.getElementById("padraoInput").value="";
    document.getElementById("padraoWrap").hidden=true;
    persistir(); renderExtra();
  }

  function removerEquipe(id){
    if(visaoAtiva()){
      if(estado.visao.modo!=="editar") return;
      const i=estado.prop.equipes.findIndex(e=>e.id===id); if(i<0) return;   // equipes da definitiva não saem pela proposta
      estado.prop.equipes.splice(i,1);
    }else{
      if(!ehEditorDef()) return;
      estado.equipes=estado.equipes.filter(e=>e.id!==id);
    }
    if(estado.pincel && estado.pincel.tipo==="equipe" && estado.pincel.ref===id) estado.pincel=null;
    // Os dias já montados são mantidos (os peritos ficam materializados no dia).
    persistir(); renderExtra();
    toast("Equipe removida. Os plantões já lançados foram mantidos.",{rotulo:"Desfazer",fn:desfazer});
  }

  function atribuirQuick(){
    if(!editavelAgora()) return;
    if(!estado.pincel){ toast("Escolha uma equipe, um perito ou a borracha primeiro."); return; }
    const nd=diasNoMes(estado.ano,estado.mes);
    const dias=parseDias(document.getElementById("quickDias").value,nd);
    if(!dias.length){ toast("Digite os dias, ex.: 2-5, 17-20"); return; }
    if(estado.pincel.tipo==="equipe"){ const eq=equipePorId(estado.pincel.ref); if(!eq) return; dias.forEach(d=>setOcupantes(d,eq.membros.slice())); }
    else if(estado.pincel.tipo==="perito"){ const pid=estado.pincel.ref; dias.forEach(d=>{ const oc=ocupantesDoDia(d); if(!oc.includes(pid)) setOcupantes(d,oc.concat(pid)); }); }
    else if(estado.pincel.tipo==="borracha"){ dias.forEach(d=>setOcupantes(d,[])); }
    document.getElementById("quickDias").value="";
    persistir(); refreshExtra();
    toast(dias.length+" dia(s) atualizado(s).");
  }

  async function aplicarAcordo(){
    if(!editavelAgora()) return;
    const recs=estado.equipes.filter(e=>e.recorrente&&(e.diasPadrao||[]).length);
    if(!recs.length){ toast("Nenhuma equipe recorrente com dias-padrão."); return; }
    const nd=diasNoMes(estado.ano,estado.mes);
    const ocupados=new Set(); recs.forEach(e=>e.diasPadrao.forEach(d=>{ if(d<=nd&&ocupantesDoDia(d).length&&!mesmoConjunto(ocupantesDoDia(d),e.membros)) ocupados.add(d); }));
    if(ocupados.size&&!await confirmar("Aplicar acordo base",'<p>O acordo vai substituir o que já está lançado em <b>'+plural(ocupados.size,"dia")+'</b> (<span class="mono">'+compactaDias([...ocupados])+'</span>).</p>',"Aplicar")) return;
    let n=0;
    recs.forEach(e=>{ e.diasPadrao.forEach(d=>{ if(d<=nd){ setOcupantes(d,e.membros.slice()); n++; } }); });
    persistir(); renderExtra();
    toast("Acordo base aplicado em "+n+" dia(s). Ajuste o que faltar para fechar as cotas.");
  }

  async function copiarMesAnterior(){
    if(!editavelAgora()) return;
    let m=estado.mes-1,a=estado.ano; if(m<1){ m=12; a--; }
    const src=estado.extra[chaveMes(a,m)];
    if(!src||!Object.keys(src).length){ toast("O mês anterior está vazio."); return; }
    const nd=diasNoMes(estado.ano,estado.mes), atuais=Object.keys(extraDoMes()).length;
    if(atuais&&!await confirmar("Copiar mês anterior",'<p>Os dias de <b>'+MESES[m-1]+'</b> serão copiados por cima do que já foi lançado neste mês ('+plural(atuais,"dia")+').</p>',"Copiar")) return;
    let n=0; Object.keys(src).forEach(d=>{ if(+d<=nd && Array.isArray(src[d]) && src[d].length){ setOcupantes(+d,src[d].slice()); n++; } });
    persistir(); renderExtra();
    toast("Copiados "+n+" dia(s) de "+MESES[m-1]+".",{rotulo:"Desfazer",fn:desfazer});
  }

  async function limparMes(){
    if(!editavelAgora()) return;
    const n=Object.keys(extraDoMes()).length;
    if(!n){ toast("Mês já está vazio."); return; }
    if(!await confirmar("Limpar mês",'<p>Apagar os <b>'+plural(n,"dia")+'</b> lançados na escala extraoficial de <b>'+nomeMesAno(estado.ano,estado.mes)+'</b>?</p><p class="hint">Dá para voltar atrás com <b>Desfazer</b>.</p>',"Limpar mês",true)) return;
    if(visaoAtiva()) estado.prop.dias={}; else delete estado.extra[chaveMes()];
    persistir(); renderExtra();
    toast("Mês limpo.",{rotulo:"Desfazer",fn:desfazer});
  }

  function toggleLock(){
    if(!ehEditorDef()||estado.visao) return;
    const k=chaveMes();
    if(estado.fechados.includes(k)) estado.fechados=estado.fechados.filter(x=>x!==k);
    else{ estado.fechados.push(k); estado.pincel=null; }
    persistir(); renderExtra();
  }

  // ---------- Cadastro de perito ----------
  function cadastrar(){
    if(!ehEditorDef()) return;
    const nomeInp=document.getElementById("nomeInput"), nome=nomeInp.value.trim().slice(0,80), sel=document.querySelector('input[name="grp"]:checked');
    if(!nome){ nomeInp.focus(); flash(nomeInp); return; }
    if(!sel){ flash(document.getElementById("grpPick")); toast("Escolha o grupo do perito."); return; }
    if(estado.peritos.some(p=>p.nome.toLocaleLowerCase("pt")===nome.toLocaleLowerCase("pt"))) toast("Atenção: já existe um perito com o nome “"+nome+"”.");
    estado.peritos.push({id:uid(),nome,grupo:sel.value,ferias:[]});
    nomeInp.value=""; sel.checked=false;
    document.querySelectorAll(".grp-opt").forEach(o=>o.classList.remove("sel"));
    nomeInp.focus(); persistir(); render();
  }
  function flash(el){ el.animate([{boxShadow:"0 0 0 3px rgba(178,59,59,0)"},{boxShadow:"0 0 0 3px rgba(178,59,59,.35)"},{boxShadow:"0 0 0 3px rgba(178,59,59,0)"}],{duration:600}); }

  // ---------- Exportar/Importar ----------
  function exportar(){
    if(!ehEditorDef()) return;
    baixar(new Blob([JSON.stringify(snapshot(),null,2)],{type:"application/json"}),"escala-npf-"+isoDe(new Date())+".json");
    toast("Backup exportado.");
  }
  // Lê um arquivo de backup (.json) e devolve os dados já validados e limpos: nada do arquivo é usado sem passar pela sanitização.
  function lerBackup(file){
    return new Promise((resolve,reject)=>{
      const r=new FileReader();
      r.onerror=()=>reject(new Error("Não foi possível ler o arquivo."));
      r.onload=e=>{
        let data; try{ data=JSON.parse(e.target.result); }catch(err){ reject(new Error("Arquivo inválido.")); return; }
        if(Array.isArray(data)) data={peritos:data, equipes:estado.equipes, extra:estado.extra, fechados:estado.fechados, feriadosExtras:estado.feriadosExtras, config:estado.config};
        const s=sanitizar(data);
        if(!s.peritos.length&&!Object.keys(s.extra).length){ reject(new Error("O arquivo não contém dados da escala.")); return; }
        resolve({dados:Object.assign({versao:VERSAO_DADOS},s), resumo:{peritos:s.peritos.length, equipes:s.equipes.length, meses:Object.keys(s.extra).length, fechados:s.fechados.length}});
      };
      r.readAsText(file);
    });
  }
  async function importar(file){
    if(!ehEditorDef()) return;
    let res; try{ res=await lerBackup(file); }catch(err){ toast(err.message); return; }
    const s=res.resumo;
    const ok=await confirmar("Importar backup",
      '<p>O arquivo tem <b>'+plural(s.peritos,"perito")+'</b>, <b>'+plural(s.equipes,"equipe")+'</b> e escalas de <b>'+plural(s.meses,"mês","meses")+'</b>.</p><p>Os dados atuais serão <b>substituídos</b>. Dá para voltar atrás com <b>Desfazer</b>.</p>',"Importar");
    if(!ok) return;
    aplicarDados(res.dados); persistir(); render();
    toast("Dados importados.",{rotulo:"Desfazer",fn:desfazer});
  }

  // ---------- Seletores ----------
  function popularAnos(){ const s=document.getElementById("anoSel"); s.innerHTML=""; for(let y=LIM_INF.ano;y<=LIM_SUP.ano;y++){ const o=document.createElement("option"); o.value=String(y); o.textContent=String(y); s.appendChild(o); } }
  function popularMeses(ano){
    const s=document.getElementById("mesSel");
    const mIni=(ano===LIM_INF.ano)?LIM_INF.mes:1, mFim=(ano===LIM_SUP.ano)?LIM_SUP.mes:12;
    if(estado.mes<mIni) estado.mes=mIni; if(estado.mes>mFim) estado.mes=mFim;
    s.innerHTML="";
    for(let m=mIni;m<=mFim;m++){ const o=document.createElement("option"); o.value=String(m); o.textContent=MESES[m-1].charAt(0).toUpperCase()+MESES[m-1].slice(1); s.appendChild(o); }
  }
  function mudarMes(delta){ let m=estado.mes+delta,a=estado.ano; if(m<1){m=12;a--;} if(m>12){m=1;a++;} const c=clampMesAno(a,m); estado.ano=c.ano; estado.mes=c.mes; render(); }
  function irParaHoje(){ const h=new Date(), c=clampMesAno(h.getFullYear(),h.getMonth()+1); estado.ano=c.ano; estado.mes=c.mes; render(); }

  // ---------- Abas ----------
  const ABAS={oficial:["tabOficial","tabBtnOficial"], extra:["tabExtra","tabBtnExtra"], propostas:["tabPropostas","tabBtnProp"]};
  function abasDisponiveis(){ return estado.papel==="mestre"||estado.papel==="colaborador"?["oficial","extra","propostas"]:["oficial","extra"]; }
  function setAba(aba){
    if(!abasDisponiveis().includes(aba)) aba="oficial";
    estado.aba=aba;
    Object.keys(ABAS).forEach(k=>{ const on=k===aba; document.getElementById(ABAS[k][0]).hidden=!on; const b=document.getElementById(ABAS[k][1]); b.classList.toggle("active",on); b.setAttribute("aria-selected",on); });
    salvarPrefs();
    avisarRender();
  }

  // ---------- Tema ----------
  function temaEfetivo(){ const t=prefs.tema||"auto"; if(t!=="auto") return t; return window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"escuro":"claro"; }
  function aplicarTema(t){
    prefs.tema=t; salvarPrefs();
    const root=document.documentElement;
    if(t==="claro") root.dataset.theme="light"; else if(t==="escuro") root.dataset.theme="dark"; else delete root.dataset.theme;
    document.querySelectorAll("#cfgTema button").forEach(b=>b.classList.toggle("active",b.dataset.t===t));
    const meta=document.querySelector('meta[name="theme-color"]'); if(meta) meta.content=temaEfetivo()==="escuro"?"#0E131A":"#152238";
  }

  // ---------- Conta / nuvem ----------
  // nuvem.js (Firebase) atualiza Nuvem.info e registra a API; acesso.js desenha a tela de acesso e as propostas.
  const Nuvem = {
    info:{
      disponivel:NUVEM_ATIVA, status:NUVEM_ATIVA?"sincronizando":"local", usuario:null, detalhe:"", salvoEm:null,
      acesso:{estado:NUVEM_ATIVA?"conectando":"ativo", papel:NUVEM_ATIVA?null:"local"},
      acessos:[], acessosCarregados:false, propostas:[], propostasCarregadas:false
    },
    api:null, ganchos:[],
    definir(p){ Object.assign(this.info,p); renderConta(); this.avisar(); },
    registrar(api){ this.api=api; renderConta(); this.avisar(); },
    aoMudar(cb){ this.ganchos.push(cb); },
    avisar(){ this.ganchos.forEach(cb=>{ try{ cb(this.info); }catch(e){ console.error(e); } }); }
  };
  const ROTULO_STATUS={local:"Só neste navegador", desconectado:"Desconectado", sincronizando:"Conectando…", salvando:"Salvando…", salvo:"Salvo na nuvem", atualizado:"Atualizado", offline:"Offline", erro:"Erro na nuvem"};
  function hora(ms){ const d=new Date(ms); return _pad2(d.getHours())+":"+_pad2(d.getMinutes()); }
  function safeParse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }
  // A foto de perfil só é exibida se vier do Google: quem pede acesso escolhe o texto do próprio perfil e não pode escolher um endereço de imagem para rastrear o administrador.
  function fotoSegura(url){ return /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(url||"")?url:""; }
  function avatarHtml(u){ const f=fotoSegura(u&&u.foto); return f?'<img alt="" referrerpolicy="no-referrer" src="'+escapar(f)+'">':escapar((((u&&(u.nome||u.email))||"?")+"").charAt(0).toUpperCase()); }
  function statusTexto(){
    const i=Nuvem.info;
    if(i.status==="salvo"&&i.salvoEm) return "Tudo salvo na nuvem (última gravação às "+hora(i.salvoEm)+").";
    if(i.status==="atualizado") return "Você está vendo a escala atualizada em tempo real.";
    return ROTULO_STATUS[i.status]||"";
  }
  function renderConta(){
    const i=Nuvem.info, chip=document.getElementById("syncChip"), login=document.getElementById("loginBtn"), av=document.getElementById("avatarBtn");
    chip.dataset.s=i.status; chip.querySelector(".st").textContent=ROTULO_STATUS[i.status]||i.status;
    chip.title=i.detalhe||(i.status==="salvo"&&i.salvoEm?"Salvo na nuvem às "+hora(i.salvoEm):"Onde seus dados estão salvos");
    login.hidden=true;                       // o login é feito na tela de acesso
    chip.hidden=NUVEM_ATIVA&&!i.usuario;
    av.hidden=!i.usuario;
    if(i.usuario){
      av.title="Conectado como "+(i.usuario.email||i.usuario.nome)+(estado.papel?" · "+(PAPEIS[estado.papel]||""):"");
      av.innerHTML=avatarHtml(i.usuario);
      const img=av.querySelector("img"); if(img) img.addEventListener("error",()=>{ av.textContent=(i.usuario.nome||"?").charAt(0).toUpperCase(); });
    }
    renderAviso();
    if(document.getElementById("cfgDlg").open) renderCfgConta();
  }
  function renderAviso(){
    const papel=estado.papel;
    document.getElementById("avisoIcone").classList.toggle("nuvem",NUVEM_ATIVA&&!!Nuvem.info.usuario);
    let titulo, texto;
    if(papel==="mestre"){
      titulo="Você é o administrador da escala de "+UNIDADE;
      texto='A escala definitiva fica salva na nuvem e é exibida, em tempo real, para as pessoas que você autorizou. Só você altera a escala definitiva: quem colabora envia <b>propostas</b> e você aprova na aba <b>Aprovações</b>. Uma cópia fica neste navegador para abrir rápido e funcionar sem internet — o que for alterado offline sobe quando a conexão voltar.';
    }else if(papel==="colaborador"){
      titulo="Escala de "+UNIDADE+" — colaborador";
      texto='Você vê a escala definitiva publicada pelo administrador. Para sugerir mudanças ou montar a escala de um mês, use a aba <b>Propostas</b>: a escala só muda quando o administrador aprovar.';
    }else if(papel==="leitor"){
      titulo="Escala de "+UNIDADE+" — consulta";
      texto='Você tem acesso somente para consultar a escala definitiva publicada pelo administrador.';
    }else{
      titulo="Sobre o armazenamento dos dados";
      texto='Tudo o que você cadastra aqui — peritos, grupos, equipes, férias e as escalas montadas — fica salvo <b>apenas neste navegador, neste computador</b>. Em outro computador, outro navegador ou janela anônima você não encontrará as mesmas informações, e limpar os dados de navegação apaga tudo. Para salvar na nuvem com login do Google, veja <b>Configurações › Conta</b>.';
    }
    document.getElementById("avisoTitulo").textContent=titulo;
    document.getElementById("avisoTexto").innerHTML=texto;
  }

  // ---------- Configurações ----------
  function abrirConfig(){
    const dlg=document.getElementById("cfgDlg"), ed=ehEditorDef();
    renderCfgConta(); renderCfgFeriados(); if(ed) renderCfgVersoes();
    const h=document.getElementById("cfgHora"); h.value=estado.config.horaInicio; h.disabled=!ed;
    document.getElementById("cfgFerAddBox").hidden=!ed;
    document.querySelectorAll("#cfgTema button").forEach(b=>b.classList.toggle("active",b.dataset.t===(prefs.tema||"auto")));
    if(!dlg.open) dlg.showModal();
  }
  function renderCfgConta(){
    const box=document.getElementById("cfgConta"), i=Nuvem.info;
    const titulo='<h3><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5h7.2a3 3 0 00.4-6A4.2 4.2 0 004 7.3a2.6 2.6 0 00.5 5.2z"/></svg>Conta e sincronização</h3>';
    if(i.usuario){
      const u=i.usuario, papel=estado.papel?PAPEIS[estado.papel]:"";
      box.innerHTML=titulo+'<div class="conta-card"><span class="avatar-btn">'+avatarHtml(u)+'</span><div class="grow"><div class="cn">'+escapar(u.nome||"")+'</div><div class="ce">'+escapar(u.email||"")+(papel?' · <b>'+escapar(papel)+'</b>':'')+'</div></div><button class="btn-sm" id="cfgSair">Sair</button></div>'+
        '<p class="hint">'+escapar(i.detalhe||statusTexto())+'</p>';
      box.querySelector("#cfgSair").addEventListener("click",sair);
    }else{
      const guia=CFG.guiaUrl?'<a href="'+escapar(CFG.guiaUrl)+'" target="_blank" rel="noopener">guia de configuração</a>':'guia de configuração (README do projeto)';
      box.innerHTML=titulo+'<p>A sincronização na nuvem <b>ainda não foi ativada</b> nesta instalação — os dados ficam só neste navegador.</p>'+
        '<p class="hint">'+(i.detalhe?escapar(i.detalhe)+' ':'')+'Para ativar o login com Google, crie um projeto gratuito no Firebase e preencha o arquivo <span class="mono">config.js</span>. Passo a passo no '+guia+'.</p>';
    }
  }
  function renderCfgFeriados(){
    const box=document.getElementById("cfgFeriados"), ed=ehEditorDef(); box.innerHTML="";
    if(!estado.feriadosExtras.length){ box.innerHTML='<div class="hint">Nenhum feriado personalizado.</div>'; return; }
    estado.feriadosExtras.forEach(f=>{
      const row=document.createElement("div"); row.className="item-cfg";
      const [a,m,d]=f.data.split("-").map(Number);
      row.innerHTML='<span class="mono">'+fmtData(f.data)+'</span><span class="grow">'+escapar(f.nome)+' <small>· '+DOW_FULL[diaDaSemana(a,m,d)]+'</small></span>'+(ed?'<button class="btn-sm danger" aria-label="Remover feriado">Remover</button>':'');
      if(ed) row.querySelector("button").addEventListener("click",()=>{ estado.feriadosExtras=estado.feriadosExtras.filter(x=>x!==f); persistir(); render(); renderCfgFeriados(); });
      box.appendChild(row);
    });
  }
  function adicionarFeriado(){
    if(!ehEditorDef()) return;
    const data=document.getElementById("cfgFerData").value, nomeEl=document.getElementById("cfgFerNome"), nome=nomeEl.value.trim().slice(0,60);
    if(!RE_ISO.test(data)||!nome){ toast("Informe a data e o nome do feriado."); return; }
    const [a,m,d]=data.split("-").map(Number), existente=feriadosAno(a)[_pad2(m)+"-"+_pad2(d)];
    estado.feriadosExtras=estado.feriadosExtras.filter(f=>f.data!==data).concat({data,nome}).sort((x,y)=>x.data.localeCompare(y.data));
    nomeEl.value=""; persistir(); render(); renderCfgFeriados();
    toast(existente?"Feriado salvo (substitui “"+existente+"” nessa data).":"Feriado adicionado.");
  }
  function resumoVersao(json){ try{ const s=JSON.parse(json); return plural((s.peritos||[]).length,"perito")+" · "+plural(Object.keys(s.extra||{}).length,"mês","meses"); }catch(e){ return ""; } }
  async function renderCfgVersoes(){
    const box=document.getElementById("cfgVersoes"), hint=document.getElementById("cfgVersoesHint");
    const naNuvem=!!(Nuvem.info.usuario&&Nuvem.api&&Nuvem.api.listarVersoes&&estado.papel==="mestre");
    hint.textContent=naNuvem?"Uma cópia por dia fica guardada na nuvem por 60 dias; aqui aparecem as dos últimos 30. Restaurar substitui os dados atuais — e pode ser desfeito.":"Uma cópia por dia fica guardada neste navegador (últimos "+DIAS_HIST_LOCAL+" dias). Restaurar substitui os dados atuais — e pode ser desfeito.";
    box.innerHTML='<div class="hint">Carregando…</div>';
    let versoes=[];
    try{ versoes=naNuvem?await Nuvem.api.listarVersoes():HistLocal.listar(); }
    catch(e){ box.innerHTML='<div class="hint">Não foi possível carregar as versões da nuvem.</div>'; return; }
    box.innerHTML="";
    if(!versoes.length){ box.innerHTML='<div class="hint">Nenhuma versão salva ainda.</div>'; return; }
    versoes.forEach(v=>{
      const row=document.createElement("div"); row.className="item-cfg";
      const atual=canonico(v.json)===hist.atual, dia=fmtData(String(v.id).slice(0,10));
      row.innerHTML='<span class="mono">'+dia+'</span><span class="grow">'+(v.em?"às "+hora(v.em)+" · ":"")+(v.rotulo?escapar(v.rotulo)+" · ":"")+'<small>'+resumoVersao(v.json)+'</small></span>'+(atual?'<small>atual</small>':'<button class="btn-sm">Restaurar</button>');
      const b=row.querySelector("button");
      if(b) b.addEventListener("click",async()=>{
        if(!await confirmar("Restaurar versão",'<p>Substituir os dados atuais pela versão de <b>'+dia+'</b>'+(v.em?" (às "+hora(v.em)+")":"")+'?</p><p class="hint">Você pode voltar com <b>Desfazer</b>.</p>',"Restaurar")) return;
        restaurarJSON(v.json); renderCfgVersoes(); renderCfgFeriados();
        toast("Versão de "+dia+" restaurada.",{rotulo:"Desfazer",fn:desfazer});
      });
      box.appendChild(row);
    });
  }

  async function sair(){
    if(!Nuvem.api) return;
    const cfgDlg=document.getElementById("cfgDlg"); if(cfgDlg.open) cfgDlg.close();
    if(estado.papel==="mestre"){
      const r=await dialogo({
        titulo:"Sair da conta",
        html:'<p>A escala definitiva continua salva na nuvem. O que fazer com a cópia deste navegador?</p>',
        botoes:[{id:"apagar",rotulo:"Sair e apagar os dados deste navegador",estilo:"solid"},{id:"manter",rotulo:"Sair e manter uma cópia aqui"},{id:null,rotulo:"Cancelar"}],
        coluna:true
      });
      if(!r) return;
      await Nuvem.api.sair();
      if(r==="apagar") limparLocal();
      toast(r==="apagar"?"Você saiu. Os dados deste navegador foram apagados.":"Você saiu. Uma cópia continua neste navegador.");
    }else{
      if(!await confirmar("Sair da conta",'<p>Você sai da escala de <b>'+escapar(UNIDADE)+'</b> neste aparelho e os dados guardados aqui são apagados. Para voltar, entre de novo com sua conta Google.</p>',"Sair")) return;
      await Nuvem.api.sair();
      toast("Você saiu.");
    }
  }
  function limparLocal(){
    [CHAVE,CHAVE_HIST,CHAVE_SYNC].forEach(removerChave);
    aplicarDados({}); estado.pincel=null; estado.destaque=null;
    hist.atual=JSON.stringify(snapshot()); hist.desfazer=[]; hist.refazer=[];
    render();
  }
  // Aplica dados que chegaram da nuvem (outro dispositivo) — entra no histórico de desfazer. Só para quem edita a definitiva.
  function aplicarRemoto(json){
    const novo=canonico(json); if(!novo||novo===hist.atual) return false;
    hist.desfazer.push(hist.atual); if(hist.desfazer.length>MAX_DESFAZER) hist.desfazer.shift(); hist.refazer=[];
    aplicarDados(JSON.parse(novo)); hist.atual=JSON.stringify(snapshot());
    gravar("nuvem"); render();
    return true;
  }
  function restaurarJSON(json){ if(!ehEditorDef()) return; aplicarDados(JSON.parse(json)); persistir(); render(); }

  // ---------- Modo de uso (papel) ----------
  let cacheUid=null;
  const sessao={ ler:()=>lerJSON(CHAVE_SESSAO), gravar:v=>gravarJSON(CHAVE_SESSAO,v), limpar:()=>removerChave(CHAVE_SESSAO) };
  // Entra no app com um papel. 'local'/'mestre' trabalham na cópia deste navegador; quem só visualiza abre a cópia (cache) da escala definitiva.
  async function entrarModo(papel,opts){
    opts=opts||{};
    estado.papel=papel; estado.visao=null; estado.prop=null; estado.pincel=null; estado.feriasAberta=null; estado.busca="";
    histProp.atual=""; histProp.desfazer=[]; histProp.refazer=[];
    cacheUid=opts.uid||null;
    if(papel==="local"||papel==="mestre"){
      const s=await Store.load();
      aplicarDados(s||{});
      hist.atual=JSON.stringify(snapshot()); hist.desfazer=[]; hist.refazer=[];
      if(s&&JSON.stringify(s)!==hist.atual) Store.save(hist.atual); // grava já no formato novo (migração)
    }else{
      const c=lerJSON(CHAVE_CACHE);
      aplicarDados(c&&c.uid===cacheUid&&typeof c.json==="string"?(safeParse(c.json)||{}):{});
      hist.atual=JSON.stringify(snapshot()); hist.desfazer=[]; hist.refazer=[];
    }
    estado.destaque=prefs.destaque&&peritoPorId(prefs.destaque)?prefs.destaque:null;
    document.body.dataset.papel=papel; document.body.dataset.editor=ehEditorDef()?"1":"0";
    const tp=document.getElementById("tabBtnProp"); tp.hidden=!(papel==="mestre"||papel==="colaborador");
    tp.querySelector(".t-nome").textContent=papel==="mestre"?"Aprovações":"Propostas";
    setAba(prefs.aba||"oficial");
    render();
  }
  function sairModo(opts){
    opts=opts||{};
    if(opts.apagarCache) removerChave(CHAVE_CACHE);
    estado.papel=null; estado.visao=null; estado.prop=null; estado.pincel=null; estado.destaque=null; estado.feriasAberta=null;
    aplicarDados({}); hist.atual=JSON.stringify(snapshot()); hist.desfazer=[]; hist.refazer=[];
    histProp.atual=""; histProp.desfazer=[]; histProp.refazer=[];
    document.body.dataset.papel=""; document.body.dataset.editor="0";
    render();
  }
  // Escala definitiva que chegou da nuvem para quem só visualiza (colaborador/leitor).
  function aplicarDefinitiva(json){
    if(ehEditorDef()) return;
    if(json){ aplicarDados(safeParse(json)||{}); gravarJSON(CHAVE_CACHE,{uid:cacheUid,json,em:Date.now()}); }
    else aplicarDados({});
    if(estado.prop) saneaProposta(estado.prop);
    if(!estado.destaque&&prefs.destaque&&peritoPorId(prefs.destaque)) estado.destaque=prefs.destaque;
    hist.atual=JSON.stringify(snapshot());
    render();
  }
  function substituirDados(dados){ if(!ehEditorDef()) return; aplicarDados(dados); persistir(); render(); }
  function limparDados(){ if(!ehEditorDef()) return; aplicarDados({}); persistir(); render(); }

  // ---------- Propostas (abrir, revisar, aplicar) ----------
  function abrirProposta(doc,modo){
    const m=/^(\d{4})-(\d{1,2})$/.exec((doc&&doc.mes)||""); if(!m) return;
    const dd=dadosDeProposta(doc);
    estado.prop={id:doc.id, mes:doc.mes, dias:dd.dias, equipes:dd.equipes, observacao:String(doc.observacao||""), status:doc.status,
      autorNome:doc.autorNome||"", autorEmail:doc.autorEmail||"", motivo:doc.motivo||"", enviadoEm:doc.enviadoEm||null};
    estado.visao={modo};
    const c=clampMesAno(+m[1],+m[2]); estado.ano=c.ano; estado.mes=c.mes;
    estado.pincel=null;
    histProp.atual=snapshotProp(); histProp.desfazer=[]; histProp.refazer=[];
    setAba("extra"); render();
  }
  function sairProposta(){
    if(!estado.visao) return;
    estado.visao=null; estado.prop=null; estado.pincel=null;
    histProp.atual=""; histProp.desfazer=[]; histProp.refazer=[];
    render();
  }
  function definirObservacao(t){
    if(!estado.prop||!estado.visao||estado.visao.modo!=="editar") return;
    estado.prop.observacao=String(t||"").slice(0,2000); persistirProposta();
  }
  // A proposta aberta mudou na nuvem (aprovada, rejeitada, retirada, editada em outro aparelho…).
  function atualizarPropostaAberta(doc){
    const p=estado.prop; if(!p||!estado.visao||p.id!==doc.id) return;
    if(estado.papel==="mestre"&&estado.visao.modo==="revisar"&&doc.status!=="enviada"){
      toast("Esta proposta mudou de situação ("+(STATUS_PROPOSTA[doc.status]||doc.status).toLowerCase()+"). A revisão foi encerrada.");
      sairProposta(); return;
    }
    const mudouStatus=p.status!==doc.status;
    p.status=doc.status; p.motivo=doc.motivo||""; p.enviadoEm=doc.enviadoEm||null;
    let precisa=mudouStatus||estado.visao.modo!=="editar";
    if(estado.visao.modo!=="editar"){ const dd=dadosDeProposta(doc); p.dias=dd.dias; p.equipes=dd.equipes; p.observacao=String(doc.observacao||""); }
    if(estado.papel==="colaborador"){
      const modo=doc.status==="rascunho"?"editar":"ver";
      if(modo!==estado.visao.modo){ estado.visao.modo=modo; estado.pincel=null; precisa=true; }
    }
    if(precisa) render();
  }
  // Administrador aprova: o mês da proposta vira a escala definitiva (e, se pedido, fica fechado).
  function aplicarPropostaNaDefinitiva(doc,fechar){
    if(!ehEditorDef()) return false;
    estado.visao=null; estado.prop=null; estado.pincel=null;     // sai da revisão: a partir daqui o que muda é a definitiva
    histProp.atual=""; histProp.desfazer=[]; histProp.refazer=[];
    const dd=dadosDeProposta(doc), k=doc.mes, m=/^(\d{4})-(\d{1,2})$/.exec(k);
    Object.keys(dd.dias).forEach(ds=>{                              // equipes novas da proposta que foram usadas entram na lista da definitiva
      const oc=dd.dias[ds];
      if(estado.equipes.some(e=>mesmoConjunto(e.membros,oc))) return;
      const loc=dd.equipes.find(e=>mesmoConjunto(e.membros,oc)); if(!loc) return;
      const cor=CORES_EQUIPE.find(c=>!estado.equipes.some(e=>e.cor===c))||loc.cor;
      estado.equipes.push({id:uid(),membros:loc.membros.slice(),cor,recorrente:false,diasPadrao:[]});
    });
    if(Object.keys(dd.dias).length) estado.extra[k]=dd.dias; else delete estado.extra[k];
    if(fechar&&!estado.fechados.includes(k)) estado.fechados.push(k);
    if(m){ const c=clampMesAno(+m[1],+m[2]); estado.ano=c.ano; estado.mes=c.mes; }
    persistir(); render();
    return true;
  }

  // ---------- Eventos ----------
  function ligarEventos(){
    document.getElementById("addBtn").addEventListener("click",cadastrar);
    document.getElementById("nomeInput").addEventListener("keydown",e=>{ if(e.key==="Enter") cadastrar(); });
    document.querySelectorAll(".grp-opt input").forEach(inp=>inp.addEventListener("change",()=>{ document.querySelectorAll(".grp-opt").forEach(o=>o.classList.toggle("sel",o.querySelector("input").checked)); }));
    document.getElementById("buscaInput").addEventListener("input",e=>{ estado.busca=e.target.value; renderLista(); });

    document.getElementById("prev").addEventListener("click",()=>mudarMes(-1));
    document.getElementById("next").addEventListener("click",()=>mudarMes(1));
    document.getElementById("hojeBtn").addEventListener("click",irParaHoje);
    document.getElementById("mesSel").addEventListener("change",e=>{ estado.mes=+e.target.value; render(); });
    document.getElementById("anoSel").addEventListener("change",e=>{ estado.ano=+e.target.value; const c=clampMesAno(estado.ano,estado.mes); estado.ano=c.ano; estado.mes=c.mes; render(); });

    const abrirImport=()=>document.getElementById("impFile").click();
    document.getElementById("expBtn").addEventListener("click",exportar);
    document.getElementById("impBtn").addEventListener("click",abrirImport);
    document.getElementById("impFile").addEventListener("change",e=>{ if(e.target.files[0]) importar(e.target.files[0]); e.target.value=""; });

    Object.keys(ABAS).forEach(k=>document.getElementById(ABAS[k][1]).addEventListener("click",()=>setAba(k)));
    document.querySelector(".tabs").addEventListener("keydown",e=>{ if(e.key==="ArrowRight"||e.key==="ArrowLeft"){ const l=abasDisponiveis(), i=l.indexOf(estado.aba), nova=l[(i+(e.key==="ArrowRight"?1:l.length-1))%l.length]; setAba(nova); document.getElementById(ABAS[nova][1]).focus(); } });
    document.getElementById("vtogOficial").addEventListener("click",e=>{ const b=e.target.closest(".vt-btn"); if(b) setView("oficial",b.dataset.v); });
    document.getElementById("vtogExtra").addEventListener("click",e=>{ const b=e.target.closest(".vt-btn"); if(b) setView("extra",b.dataset.v); });
    document.getElementById("printOficial").addEventListener("click",()=>imprimir("oficial"));
    document.getElementById("printExtra").addEventListener("click",()=>imprimir("extra"));
    document.getElementById("imgOficial").addEventListener("click",()=>exportarImagem("oficial"));
    document.getElementById("imgExtra").addEventListener("click",()=>exportarImagem("extra"));
    document.querySelectorAll(".destaque-sel").forEach(s=>s.addEventListener("change",e=>setDestaque(e.target.value)));
    document.querySelectorAll(".ics-btn").forEach(b=>b.addEventListener("click",()=>exportarICS(b.dataset.aba)));

    // extraoficial
    document.getElementById("recCheck").addEventListener("change",e=>{ document.getElementById("padraoWrap").hidden=!e.target.checked; });
    document.getElementById("addEquipeBtn").addEventListener("click",criarEquipe);
    document.getElementById("quickBtn").addEventListener("click",atribuirQuick);
    document.getElementById("quickDias").addEventListener("keydown",e=>{ if(e.key==="Enter") atribuirQuick(); });
    document.getElementById("acordoBtn").addEventListener("click",aplicarAcordo);
    document.getElementById("copiarBtn").addEventListener("click",copiarMesAnterior);
    document.getElementById("limparBtn").addEventListener("click",limparMes);
    document.getElementById("lockBtn").addEventListener("click",toggleLock);
    ligarPintura();

    // barra superior
    document.getElementById("undoBtn").addEventListener("click",desfazer);
    document.getElementById("redoBtn").addEventListener("click",refazer);
    document.getElementById("temaBtn").addEventListener("click",()=>aplicarTema(temaEfetivo()==="escuro"?"claro":"escuro"));
    document.getElementById("cfgBtn").addEventListener("click",abrirConfig);
    document.getElementById("syncChip").addEventListener("click",abrirConfig);
    document.getElementById("avatarBtn").addEventListener("click",abrirConfig);

    // configurações
    const cfgDlg=document.getElementById("cfgDlg");
    document.getElementById("cfgFechar").addEventListener("click",()=>cfgDlg.close());
    cfgDlg.addEventListener("click",e=>{ if(e.target===cfgDlg) cfgDlg.close(); });
    document.getElementById("cfgHora").addEventListener("change",e=>{ if(ehEditorDef()&&RE_HORA.test(e.target.value)){ estado.config.horaInicio=e.target.value; persistir(); } });
    document.getElementById("cfgFerAdd").addEventListener("click",adicionarFeriado);
    document.getElementById("cfgFerNome").addEventListener("keydown",e=>{ if(e.key==="Enter") adicionarFeriado(); });
    document.getElementById("cfgExp").addEventListener("click",exportar);
    document.getElementById("cfgImp").addEventListener("click",()=>{ cfgDlg.close(); abrirImport(); });
    document.getElementById("cfgTema").addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) aplicarTema(b.dataset.t); });
    if(window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{ if((prefs.tema||"auto")==="auto") aplicarTema("auto"); });

    // atalhos de teclado
    document.addEventListener("keydown",e=>{
      const emCampo=e.target.closest&&e.target.closest("input,select,textarea,[contenteditable]");
      const mod=e.ctrlKey||e.metaKey;
      if(mod&&!emCampo&&!document.querySelector("dialog[open]")){
        const k=e.key.toLowerCase();
        if(k==="z"&&!e.shiftKey){ e.preventDefault(); desfazer(); }
        else if(k==="y"||(k==="z"&&e.shiftKey)){ e.preventDefault(); refazer(); }
      }
      if(e.key==="Escape"&&estado.pincel&&!document.querySelector("dialog[open]")){ estado.pincel=null; atualizarSelecaoPincel(); }
    });

    // mesma escala aberta em outra aba deste navegador
    window.addEventListener("storage",e=>{
      if(e.key!==CHAVE||!e.newValue||e.newValue===hist.atual||!ehEditorDef()||estado.visao) return;
      try{ aplicarDados(JSON.parse(e.newValue)); hist.atual=JSON.stringify(snapshot()); render(); }catch(err){}
    });
  }

  // ---------- Início ----------
  let marcarPronto;
  const pronto=new Promise(r=>marcarPronto=r);
  async function init(){
    popularAnos();
    const c=clampMesAno(hoje.getFullYear(),hoje.getMonth()+1); estado.ano=c.ano; estado.mes=c.mes;
    const estreito=window.matchMedia&&window.matchMedia("(max-width:560px)").matches;
    estado.viewOficial=prefs.viewOficial||(estreito?"lista":"grade");
    estado.viewExtra=prefs.viewExtra||"grade";
    aplicarTema(prefs.tema||"auto");
    document.getElementById("subUnidade").textContent=UNIDADE+" · rodízio contínuo de 4 grupos · 24h de plantão, 72h de folga";
    document.title="Escala de Plantões — "+UNIDADE;
    ligarEventos();
    if(!NUVEM_ATIVA){      // sem Firebase configurado: uso local, como na versão anterior
      if(CFG.firebase&&CFG.firebase.apiKey) Nuvem.info.detalhe="O login com Google só funciona com o app publicado (endereço https), não abrindo o arquivo direto do computador.";
      await entrarModo("local");
    }
    renderConta();
    marcarPronto();
  }

  // API usada pelos outros módulos (nuvem.js e acesso.js)
  window.EscalaApp = {
    pronto, nuvemAtiva:NUVEM_ATIVA, unidade:UNIDADE, estado,
    obterJSON:()=>hist.atual, canonico, temDados, aplicarRemoto,
    aoMudar:cb=>ouvintes.push(cb), aoMudarProposta:cb=>ouvintesProposta.push(cb), aoRenderizar:cb=>ganchosRender.push(cb),
    sync:SyncMeta, nuvem:Nuvem, sessao, toast, dialogo, confirmar,
    entrarModo, sairModo, aplicarDefinitiva, lerBackup, substituirDados, limparDados,
    abrirProposta, sairProposta, definirObservacao, atualizarPropostaAberta, aplicarPropostaNaDefinitiva, resumoProposta, dadosDeProposta, diasDiferentes,
    setAba, render, visaoAtiva, editavelAgora, mesFechado:k=>estado.fechados.includes(k),
    util:{escapar, plural, nomeMesAno, compactaDias, fmtData, hora, fotoSegura, avatarHtml, MESES, DOW_FULL, LIM_INF, LIM_SUP, diasNoMes,
      mesmoConjunto, peritoPorId, clampMesAno, antesDe, primeiroNome, ordenarPeritos, uid, STATUS_PROPOSTA, PAPEIS, UNIDADE}
  };

  init();
})();
