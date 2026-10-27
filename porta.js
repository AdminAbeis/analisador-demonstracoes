/* Porta de entrada do site protegido (publicada só quando há senha nos Secrets do GitHub).
   Pede a senha, descriptografa o código do analisador (app.enc.json) e o executa. */
(() => {
  const LEMBRAR = 'analisador-acesso';
  const dec = new TextDecoder(), enc = new TextEncoder();
  const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const subtle = window.crypto && window.crypto.subtle;
  let PACOTE = null;

  // "Lembrar neste navegador" marcado: guarda o acesso no navegador (localStorage).
  // Desmarcado: guarda só enquanto a aba estiver aberta (sessionStorage), para recarregar sem pedir de novo.
  function lerLembrado() {
    for (const st of ['localStorage', 'sessionStorage']) {
      try { const v = JSON.parse(window[st].getItem(LEMBRAR) || 'null'); if (v) return v; } catch (e) { }
    }
    return null;
  }
  function lembrar(v, persistente) {
    for (const st of ['localStorage', 'sessionStorage']) { try { window[st].removeItem(LEMBRAR); } catch (e) { } }
    if (v) { try { window[persistente ? 'localStorage' : 'sessionStorage'].setItem(LEMBRAR, JSON.stringify(v)); } catch (e) { } }
  }

  async function abrirConteudo(kB64) {
    const K = await subtle.importKey('raw', deB64(kB64), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const c = PACOTE.conteudo;
    const codigo = dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: deB64(c.iv) }, K, deB64(c.ct)));
    return { K, codigo };
  }
  async function tentarSenha(senha) {
    const base = await subtle.importKey('raw', enc.encode(senha), 'PBKDF2', false, ['deriveKey']);
    for (const a of PACOTE.acessos) {
      const W = await subtle.deriveKey({ name: 'PBKDF2', salt: deB64(a.sal), iterations: PACOTE.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      try { return JSON.parse(dec.decode(await subtle.decrypt({ name: 'AES-GCM', iv: deB64(a.iv) }, W, deB64(a.ct)))); } catch (e) { /* outra senha */ }
    }
    return null;
  }
  function executar(K, modo, codigo) {
    window.ACESSO = { modo, chave: K, sair() { lembrar(null); location.reload(); } };
    const porta = document.getElementById('porta'); if (porta) porta.remove();
    document.documentElement.classList.remove('trancado');
    const s = document.createElement('script');
    s.src = URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' }));
    document.body.appendChild(s);
  }
  function mostrarPorta(msg) {
    const d = document.createElement('div');
    d.className = 'porta'; d.id = 'porta';
    d.innerHTML = `<form class="porta-caixa" autocomplete="on">
      <div class="eyebrow">Analisador de demonstrações</div>
      <h1>Acesso restrito</h1>
      <p class="nota">Digite a senha que você recebeu do administrador.</p>
      <input type="text" name="username" value="analisador" autocomplete="username" hidden>
      <label class="porta-campo"><span>Senha</span><input type="password" id="porta-senha" autocomplete="current-password" required></label>
      <label class="check"><input type="checkbox" id="porta-lembrar"> Lembrar neste navegador</label>
      <button class="btn primario" type="submit">Entrar</button>
      <p class="porta-erro" id="porta-erro" role="alert">${msg || ''}</p>
    </form>`;
    document.body.appendChild(d);
    const f = d.querySelector('form'), inp = d.querySelector('#porta-senha'), err = d.querySelector('#porta-erro'), bt = d.querySelector('button');
    inp.focus();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      bt.disabled = true; bt.textContent = 'Conferindo…'; err.textContent = '';
      try {
        const r = await tentarSenha(inp.value);
        if (!r) { err.textContent = 'Senha incorreta.'; inp.select(); return; }
        const { K, codigo } = await abrirConteudo(r.k);
        lembrar({ k: r.k, modo: r.modo }, d.querySelector('#porta-lembrar').checked);
        executar(K, r.modo, codigo);
      } catch (e2) {
        err.textContent = 'Não foi possível abrir o site. Recarregue a página e tente de novo.';
      } finally { bt.disabled = false; bt.textContent = 'Entrar'; }
    });
  }

  async function iniciar() {
    if (!subtle) { mostrarPorta('Este navegador não permite abrir o site protegido. Use uma versão recente do Chrome, Edge, Safari ou Firefox.'); return; }
    try {
      const r = await fetch('app.enc.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      PACOTE = await r.json();
    } catch (e) { mostrarPorta('Não foi possível carregar o site. Verifique a conexão e recarregue a página.'); return; }
    const salvo = lerLembrado();
    if (salvo && salvo.k) {
      try { const { K, codigo } = await abrirConteudo(salvo.k); executar(K, salvo.modo, codigo); return; }
      catch (e) { lembrar(null); } // a senha mudou: pede de novo
    }
    mostrarPorta();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
