// content.js (isolated world)
(() => {
  { // inject.js を main world に注入
    const s = document.createElement("script");

    s.src = chrome.runtime.getURL("inject.js");
    s.type = "text/javascript";
    (document.documentElement || document.head).appendChild(s);
    s.remove();
  }

  // main world -> content -> SW
  window.addEventListener("message", async event => {
    if (event.source !== window) {
      return;
    }
  
    const msg = event.data;

    if (!msg || msg.__chatgpt_conversation_pruner__ !== true) {
      return;
    }
    if (msg.type !== "FETCH_REQUEST") {
      return;
    }

    try {
      const res = await chrome.runtime.sendMessage({
        type: "FETCH_REQUEST",
        requestId: msg.requestId,
        request: msg.request
      });
      window.postMessage(
        {
          __chatgpt_conversation_pruner__: true,
          type: "FETCH_RESPONSE",
          requestId: msg.requestId,
          response: res.response,
          error: res.error ?? null
        },
        "*"
      );
    } catch (e) {
      window.postMessage(
        {
          __chatgpt_conversation_pruner__: true,
          type: "FETCH_RESPONSE",
          requestId: msg.requestId,
          response: null,
          error: String(e?.message || e)
        },
        "*"
      );
    }
  });
})();
