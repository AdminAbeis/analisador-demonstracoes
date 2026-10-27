// Protege o site publicado com senha.
//
// Uso: node pipeline/proteger.js _site
//
// Lê as senhas das variáveis de ambiente SENHA_ADMIN e SENHA_LEITURA (Secrets do GitHub).
// Sem SENHA_ADMIN, não faz nada: o site é publicado aberto, como antes.
//
// Com senha, engine.js e app.js são juntados e criptografados (AES-GCM) em app.enc.json, e os
// arquivos originais saem da pasta publicada. A página passa a carregar porta.js, que pede a senha,
// descriptografa o código no navegador e só então o executa.
//
// A chave do conteúdo é derivada da senha de administrador, então continua a mesma entre uma
// publicação e outra (os links de leitura e o "lembrar neste navegador" não se perdem).
// Cada senha guarda uma cópia dessa chave, criptografada com ela, junto com o modo de acesso:
//   - administrador: tudo liberado;
//   - leitura: só a análise da empresa e do período do link gerado pelo administrador.
'use strict';
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;
const getRandomValues = a => webcrypto.getRandomValues(a);

const ITER = 200000;
const b64 = u8 => Buffer.from(u8).toString('base64');
const enc = new TextEncoder();

async function chaveDaSenha(senha, sal, usos) {
  const base = await subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  return subtle.deriveKey({ name: 'PBKDF2', salt: sal, iterations: ITER, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, usos);
}
async function bytesDaSenha(senha, sal) {
  const base = await subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', salt: sal, iterations: ITER, hash: 'SHA-256' }, base, 256));
}
async function cifrar(chave, dados) {
  const iv = getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, chave, dados));
  return { iv: b64(iv), ct: b64(ct) };
}

async function proteger(pasta, senhaAdmin, senhaLeitura) {
  const codigo = ['engine.js', 'app.js'].map(f => fs.readFileSync(path.join(pasta, f), 'utf8')).join('\n;\n');
  // chave do conteúdo: estável enquanto a senha de administrador não mudar
  const bruta = await bytesDaSenha(senhaAdmin, enc.encode('analisador-demonstracoes/conteudo'));
  const K = await subtle.importKey('raw', bruta, 'AES-GCM', false, ['encrypt']);
  const conteudo = await cifrar(K, enc.encode(codigo));
  const acessos = [];
  for (const [senha, modo] of [[senhaAdmin, 'admin'], [senhaLeitura, 'leitura']]) {
    if (!senha) continue;
    const sal = getRandomValues(new Uint8Array(16));
    const W = await chaveDaSenha(senha, sal, ['encrypt']);
    acessos.push({ sal: b64(sal), ...(await cifrar(W, enc.encode(JSON.stringify({ k: b64(bruta), modo })))) });
  }
  // a ordem não indica qual senha é de qual modo
  if (acessos.length > 1 && getRandomValues(new Uint8Array(1))[0] & 1) acessos.reverse();
  fs.writeFileSync(path.join(pasta, 'app.enc.json'), JSON.stringify({ v: 1, iter: ITER, acessos, conteudo }));
  for (const f of ['engine.js', 'app.js']) fs.unlinkSync(path.join(pasta, f));
  fs.copyFileSync(path.join(__dirname, '..', 'porta.js'), path.join(pasta, 'porta.js'));
  const idx = path.join(pasta, 'index.html');
  let html = fs.readFileSync(idx, 'utf8');
  const scripts = /<script src="engine\.js"><\/script>\s*<script src="app\.js"><\/script>/;
  if (!scripts.test(html)) throw new Error('index.html: não encontrei os scripts engine.js e app.js');
  html = html.replace(scripts, '<script src="porta.js"></script>').replace('<html lang="pt-BR">', '<html lang="pt-BR" class="trancado">');
  fs.writeFileSync(idx, html);
  return acessos.length;
}

if (require.main === module) {
  const pasta = process.argv[2];
  if (!pasta) { console.error('uso: node pipeline/proteger.js <pasta do site>'); process.exit(2); }
  const admin = process.env.SENHA_ADMIN || '', leitura = process.env.SENHA_LEITURA || '';
  if (!admin) { console.log('SENHA_ADMIN não configurada: site publicado sem senha.'); process.exit(0); }
  if (leitura && leitura === admin) { console.error('SENHA_LEITURA precisa ser diferente de SENHA_ADMIN.'); process.exit(1); }
  proteger(pasta, admin, leitura).then(n => console.log(`Site protegido com ${n} ${n === 1 ? 'senha' : 'senhas'} (${leitura ? 'administrador e leitura' : 'só administrador'}).`))
    .catch(e => { console.error(e); process.exit(1); });
}
module.exports = { proteger, ITER };
