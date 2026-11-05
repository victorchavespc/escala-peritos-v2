// Configuração desta instalação — é o ÚNICO arquivo que você precisa editar para ativar o login com Google.
// Passo a passo no README.md, seção "Ativar o login com Google e a nuvem".
//
// A "apiKey" do Firebase não é uma senha: ela só identifica o projeto e pode ficar pública.
// Quem protege os dados são as regras do Firestore (arquivo firestore.rules), que você publica no console do Firebase.
window.ESCALA_CONFIG = {
  // Cole aqui o objeto "firebaseConfig" do console do Firebase.
  // Enquanto estiver null, o app funciona normalmente, mas salva só no navegador (sem login, sem compartilhamento).
  firebase: { apiKey: "AIzaSyBnW4wVQCrbsDkCBUpsGFrjDGNFSlw4vnI", authDomain: "escala-npf.firebaseapp.com", projectId: "escala-npf", storageBucket: "escala-npf.firebasestorage.app", messagingSenderId: "97876255500", appId: "1:97876255500:web:fefb68f2721330f30edf29" },
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

  // ADMINISTRADOR: o único e-mail que define a escala definitiva, autoriza pessoas e aprova propostas.
  // Este valor só controla o que aparece na tela; quem impede de verdade é o firestore.rules,
  // que tem o mesmo e-mail. Se mudar aqui, mude lá também.
  mestre: "victorchaves.pc@gmail.com",

  // Nome da unidade, exibido no cabeçalho e na tela de acesso.
  unidade: "Itaberaba",

  // Link exibido em Configurações para o guia de instalação.
  guiaUrl: "https://github.com/victorchavespc/escala-peritos-v2#readme"
};
