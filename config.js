// Configuração desta instalação — é o ÚNICO arquivo que você precisa editar para ativar o login com Google.
// Passo a passo no README.md, seção "Ativar o login com Google e salvar na nuvem".
//
// A "apiKey" do Firebase não é uma senha: ela só identifica o projeto e pode ficar pública.
// Quem protege os dados são as regras do Firestore (arquivo firestore.rules).
window.ESCALA_CONFIG = {
  // Cole aqui o objeto "firebaseConfig" do console do Firebase.
  // Enquanto estiver null, o app funciona normalmente, mas salva só no navegador.
  firebase: null,
  /* Exemplo de como fica depois de preenchido:
  firebase: {
    apiKey: "AIza...",
    authDomain: "escala-npf.firebaseapp.com",
    projectId: "escala-npf",
    storageBucket: "escala-npf.firebasestorage.app",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abc123def456"
  },
  */

  // Opcional: e-mails que podem entrar. Serve só para mostrar um aviso amigável —
  // o bloqueio de verdade é feito no firestore.rules (coloque os mesmos e-mails lá).
  emailsPermitidos: [],

  // Link exibido em Configurações para o guia de instalação.
  guiaUrl: "https://github.com/victorchavespc/escala-peritos-v2#readme"
};
