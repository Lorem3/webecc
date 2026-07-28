import {
  createAppState, bindCommonButtons, initBookmark, autoFetchHistory,
  showBuildInfo, initSquircle,
} from './common';

const App = (function () {

  async function init() {
    let ec = await ECC.initEC();
    const state = createAppState();

    bindCommonButtons(ec, state);
    await initBookmark(ec, state);
    await autoFetchHistory(ec, state);
    showBuildInfo();
  }

  return { init };
})();
App.init();

initSquircle();
