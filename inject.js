// inject.js (main world)
(() => {
  const originalFetch = window.fetch;
  const TARGET_PREFIX = /^https:\/\/chatgpt\.com\/backend-api\/conversation\/[0-9a-fA-F-]{36}$/;
  const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  function isTarget(url, method) {
    // /backend-api/conversation/{uuid-ish}
    return method === "GET" && typeof url === "string" && TARGET_PREFIX.test(url);
  }

  async function buildRequest(input, init) {
    const req = new Request(input, init);
    const headers = [];

    req.headers.forEach((v, k) => headers.push([k, v]));

    return {
      url: req.url,
      method: req.method,
      headers,
      body: undefined,
      credentials: req.credentials || "include",
      redirect: req.redirect || "follow",
      cache: req.cache || "default",
      mode: req.mode || "cors"
    };
  }

  function sendToExtension(requestId, request) {
    return new Promise((resolve, reject) => {
      const onMessage = event => {
        if (event.source !== window) {
          return;
        }

        const msg = event.data;

        if (!msg || msg.__chatgpt_conversation_pruner__ !== true) {
          return;
        }
        if (msg.type !== "FETCH_RESPONSE") {
          return;
        }
        if (msg.requestId !== requestId) {
          return;
        }

        window.removeEventListener("message", onMessage);

        if (msg.error) {
          reject(new Error(msg.error));
        } else {
          resolve(msg.response);
        }
      };

      window.addEventListener("message", onMessage);

      window.postMessage(
        {
          __chatgpt_conversation_pruner__: true,
          type: "FETCH_REQUEST",
          requestId,
          request
        },
        "*"
      );
    });
  }

  function getUrlFromInput(input) {
    if (typeof input === "string") {
      return input;
    }
    if (input instanceof URL) {
      return input.toString();
    }
    if (input instanceof Request) {
      return input.url;
    }

    return String(input);
  }

  function getMethodFromInput(input, init) {
    // init.method が最優先。次に Request.method。無ければ GET。
    const m = init?.method ?? (input instanceof Request ? input.method : "GET");

    return (m || "GET").toUpperCase();
  }

  window.fetch = new Proxy(originalFetch, {
    async apply(target, thisArg, args) {
      const input = args[0];
      const init = args[1];
      const url = getUrlFromInput(input);
      const method = getMethodFromInput(input, init);

      // 対象 URL, Method 以外は完全素通し
      if (!isTarget(url, method)) {
        return Reflect.apply(target, thisArg, args);
      }

      const requestId = makeId();
      const request = await buildRequest(input, init);
      const proxied = await sendToExtension(requestId, request);

      // Response を 再構築する
      const headers = new Headers(proxied.headers || []);
      const bodyBuf = new TextEncoder().encode(proxied.body).buffer;
      const body = proxied.body ? new Uint8Array(bodyBuf) : null;

      return new Response(body, {
        status: proxied.status,
        statusText: proxied.statusText,
        headers
      });
    }
  });

  // 目印（デバッグ用）
  console.log("[ChatGPT Conversation Pruner] fetch hooked (conversation only)");
})();
