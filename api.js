/**
 * api.js ― Apps Script（データの係）との通信と、端末への一時保存
 */

/**
 * Apps Scriptに操作を依頼する。
 * 例: Api.call('home', { token: '...' }).then(function (data) { ... })
 * 失敗したときは Error を投げる（ログインが切れたときは err.needLogin が true）。
 */
var Api = {
  call: function (action, data) {
    var url = window.APP_CONFIG.API_URL;
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^\s\/]+\/exec$/.test(url)) {
      return Promise.reject(new Error('config.js の API_URL が正しくありません（…/exec で終わるURLにしてください）。'));
    }
    var body = Object.assign({ action: action }, data || {});
    return fetch(url, {
      method: 'POST',
      // text/plain にすると、Apps Scriptが扱えない事前確認（CORSのプリフライト）が起きない
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (text) {
        var json;
        try { json = JSON.parse(text); }
        catch (e) {
          var head = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
          throw new Error('サーバーの返事が読めませんでした（状態 ' + res.status + '）: ' + head);
        }
        if (!json.ok) {
          var err = new Error(json.error || '不明なエラーです。');
          err.needLogin = !!json.needLogin;
          throw err;
        }
        return json;
      });
    }, function () {
      throw new Error('通信できませんでした。電波の良い場所で、もう一度試してください。');
    });
  }
};

/**
 * 端末への一時保存（ブラウザのlocalStorage）。
 * プライベートブラウズなどで使えない場合もあるので、失敗しても止まらないようにしている。
 */
var Store = {
  get: function (key, fallback) {
    try { var v = localStorage.getItem('ta_' + key); return v === null ? fallback : JSON.parse(v); }
    catch (e) { return fallback; }
  },
  set: function (key, value) {
    try { localStorage.setItem('ta_' + key, JSON.stringify(value)); return true; } catch (e) { return false; }
  },
  remove: function (key) {
    try { localStorage.removeItem('ta_' + key); } catch (e) { /* 何もしない */ }
  }
};
