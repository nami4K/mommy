'use strict';
/* 모든 스크립트를 읽은 뒤에 시작합니다 */
boot();
/* 앱이 열려 있을 때 받은 링크(#add=…)를 눌러도 받기 */
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#add=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  pendingImport = decodeURIComponent(m[1]);
  checkPendingImport();
});
