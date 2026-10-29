/**
 * theme.js ― 画面の色（昼／夜）の切り替え（v30）
 *
 *   ・「自動」… スマホのダークモードに合わせる（最初はこれ）
 *   ・「昼」  … いつも白地に紺の縦じま
 *   ・「夜」  … いつも紺の地に白の縦じま
 *   選んだものはこの端末に保存する（localStorage の trainingTheme）。
 *   色そのものは style.css の :root（昼）と [data-theme="dark"]（夜）で決めている。
 *   このファイルは画面が出る前に色を決めたいので、index.html の <head> で読み込む。
 */
var Theme = {
  KEY: 'trainingTheme',
  MODES: [{ key: 'auto', label: '自動' }, { key: 'light', label: '昼' }, { key: 'dark', label: '夜' }],

  /** 今の設定（auto / light / dark） */
  get: function () {
    try { var m = localStorage.getItem(this.KEY); if (m === 'light' || m === 'dark') return m; } catch (e) {}
    return 'auto';
  },

  /** 設定を変えて、すぐに色を切り替える */
  set: function (mode) {
    try { if (mode === 'auto') localStorage.removeItem(this.KEY); else localStorage.setItem(this.KEY, mode); } catch (e) {}
    this.apply();
  },

  /** 実際に夜の色になっているか（自動のときはスマホの設定を見る） */
  isDark: function () {
    var m = this.get();
    if (m !== 'auto') return m === 'dark';
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  },

  /** <html> に data-theme を付ける。ブラウザの上の帯の色（theme-color）も合わせる */
  apply: function () {
    var m = this.get(), root = document.documentElement;
    if (m === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', m);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', this.isDark() ? '#10163A' : '#FFFFFF');
  }
};
Theme.apply();
// 「自動」のとき、スマホのダークモードが切り替わったら上の帯の色も合わせる
if (window.matchMedia) {
  var _mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (_mq.addEventListener) _mq.addEventListener('change', function () { Theme.apply(); });
}
