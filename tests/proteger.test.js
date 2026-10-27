// Teste da proteção com senha: gera o site protegido numa pasta temporária e confere que
// cada senha abre o código no modo certo e que uma senha errada não abre nada.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;
const { proteger } = require('../pipeline/proteger.js');
const RAIZ = path.join(__dirname, '..');
const enc = new TextEncoder(), dec = new TextDecoder();
const deB64 = s => new Uint8Array(Buffer.from(s, 'base64'));

async function abrir(pacote, senha) {
  const base = await subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
  for (const a of pacote.acessos) {
    const W = await subtle.deriveKey({ name: 'PBKDF2', salt: deB64(a.sal), iterations: pacote.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    try {
      const r = JSON.parse(dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: deB64(a.iv) }, W, deB64(a.ct))));
      const K = await subtle.importKey('raw', deB64(r.k), 'AES-GCM', false, ['decrypt']);
      const codigo = dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: deB64(pacote.conteudo.iv) }, K, deB64(pacote.conteudo.ct)));
      return { modo: r.modo, codigo, k: r.k };
    } catch (e) { }
  }
  return null;
}

(async () => {
  const erros = [];
  const checa = (c, m) => { if (!c) erros.push(m); };
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  for (const f of ['index.html', 'app.js', 'engine.js']) fs.copyFileSync(path.join(RAIZ, f), path.join(pasta, f));
  await proteger(pasta, 'senha-admin', 'senha-grupo');
  const arqs = fs.readdirSync(pasta).sort();
  checa(JSON.stringify(arqs) === JSON.stringify(['app.enc.json', 'index.html', 'porta.js']), `arquivos publicados: ${arqs}`);
  const html = fs.readFileSync(path.join(pasta, 'index.html'), 'utf8');
  checa(html.includes('<script src="porta.js"></script>') && !html.includes('app.js"') && html.includes('class="trancado"'), 'index.html protegido');
  const pacote = JSON.parse(fs.readFileSync(path.join(pasta, 'app.enc.json'), 'utf8'));
  const adm = await abrir(pacote, 'senha-admin'), lei = await abrir(pacote, 'senha-grupo'), errada = await abrir(pacote, 'outra');
  checa(adm && adm.modo === 'admin', 'senha de administrador');
  checa(lei && lei.modo === 'leitura', 'senha de leitura');
  checa(errada === null, 'senha errada não pode abrir');
  checa(adm && adm.codigo.includes('const Engine') && adm.codigo.includes('Interface do Analisador'), 'código completo');
  checa(adm && lei && adm.k === lei.k, 'as duas senhas abrem a mesma chave');
  // a chave do conteúdo não muda entre publicações (links continuam valendo)
  const pasta2 = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  for (const f of ['index.html', 'app.js', 'engine.js']) fs.copyFileSync(path.join(RAIZ, f), path.join(pasta2, f));
  await proteger(pasta2, 'senha-admin', '');
  const p2 = JSON.parse(fs.readFileSync(path.join(pasta2, 'app.enc.json'), 'utf8'));
  const adm2 = await abrir(p2, 'senha-admin');
  checa(p2.acessos.length === 1 && adm2 && adm2.k === adm.k, 'chave estável e só administrador');
  for (const p of [pasta, pasta2]) fs.rmSync(p, { recursive: true, force: true });
  if (erros.length) { console.error('Falhas:\n- ' + erros.join('\n- ')); process.exit(1); }
  console.log('Proteção com senha: todos os testes passaram.');
})();
