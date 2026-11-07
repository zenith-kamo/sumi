'use strict';
(function () {
  const MIN_LOADING_MS = 3000;
  const SETTINGS_KEY = 'unblock-proxy:settings';
  const startedAt = Date.now();

  const orb = document.getElementById('orb');
  const errorBox = document.getElementById('error-box');
  const errorMsg = document.getElementById('error-msg');
  const btnReload = document.getElementById('btn-reload');

  let cloakPrompt = null;

  document.querySelectorAll('.glass').forEach((element) => LiquidGlass.applyGlassEffect(element));
  btnReload.addEventListener('click', () => location.reload());

  function fail(message) {
    orb.hidden = true;
    if (cloakPrompt) cloakPrompt.hidden = true;
    errorMsg.textContent = message;
    errorBox.hidden = false;
  }

  function render(html) {
    const wait = Math.max(0, MIN_LOADING_MS - (Date.now() - startedAt));
    setTimeout(() => {
      document.open();
      document.write(html);
      document.close();
    }, wait);
  }

  async function boot() {
    try {
      const res = await fetch('./obf/index', { cache: 'no-store' });
      if (!res.ok) throw new Error('サーバー応答 ' + res.status);
      const b64 = (await res.text()).trim();
      if (!/^[A-Za-z0-9+/=\s]+$/.test(b64)) throw new Error('取得したデータがBase64ではありません');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      render(new TextDecoder('utf-8').decode(bytes));
    } catch (err) {
      fail('起動に失敗しました: ' + (err && err.message ? err.message : err));
    }
  }

  /* ---------- about:blank クローキング ---------- */
  const alreadyCloaked = document.documentElement.hasAttribute('data-cloaked');

  function isCloakingEnabled() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return saved.cloaking === true;
    } catch {
      return false;
    }
  }

  /** ポップアップがブロックされた時だけ、案内UIを動的に生成する */
  function showCloakPrompt() {
    if (cloakPrompt) {
      cloakPrompt.hidden = false;
      return;
    }

    cloakPrompt = document.createElement('div');
    cloakPrompt.className = 'prompt glass';
    cloakPrompt.id = 'cloak-prompt';

    const message = document.createElement('p');
    message.textContent = 'about:blank クローキングが有効です。ポップアップがブロックされたため、自動で切り替えできませんでした。';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const btnCloak = document.createElement('button');
    btnCloak.className = 'solid';
    btnCloak.id = 'btn-cloak';
    btnCloak.textContent = 'about:blank で開く';

    const btnPlain = document.createElement('button');
    btnPlain.className = 'ghost';
    btnPlain.id = 'btn-plain';
    btnPlain.textContent = 'このまま続行';

    actions.append(btnCloak, btnPlain);
    cloakPrompt.append(message, actions);
    document.body.appendChild(cloakPrompt);
    LiquidGlass.applyGlassEffect(cloakPrompt);

    btnCloak.addEventListener('click', () => {
      if (enterCloaked()) return;
      fail('ポップアップがブロックされています。このサイトのポップアップを許可してから再度お試しください。');
    });

    btnPlain.addEventListener('click', () => {
      cloakPrompt.hidden = true;
      orb.hidden = false;
      boot();
    });
  }

  /** このページ自身を about:blank の新規タブへ転記する。成功したら true */
  function openCloaked() {
    const win = window.open('about:blank', '_blank');
    if (!win) return false;
    try {
      const baseHref = location.href.replace(/[^/]*$/, '');
      const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML
        .replace('<head>', () => '<head><base href="' + baseHref + '">')
        .replace(/^<html([^>]*)>/, '<html$1 data-cloaked>');
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.name = '__unblock_proxy_cloaked__';
    } catch {
      return false;
    }
    return true;
  }

  function enterCloaked() {
    if (!openCloaked()) {
      orb.hidden = true;
      showCloakPrompt();
      return false;
    }
    // 元のタブを閉じようとする（ブロックされた場合は案内を表示）
    btnReload.textContent = 'このタブを閉じる';
    btnReload.onclick = () => { try { window.close(); } catch {} };
    fail('about:blank のタブで起動しました。このタブは閉じてください。');
    setTimeout(() => { try { window.close(); } catch {} }, 300);
    return true;
  }

  function start() {
    if (!alreadyCloaked && isCloakingEnabled()) {
      enterCloaked();
      return;
    }
    boot();
  }

  start();
})();
