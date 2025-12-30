// background.js (service worker, module)
function roleOf(node) {
  return node?.message?.author?.role ?? null;
}

function isTurnNode(node) {
  const role = roleOf(node);
  const parts = node?.message?.content?.parts || [];
  const isUserSystemMessage = node?.message?.metadata?.is_user_system_message || false;
  const isVisuallyHidden = node?.message?.metadata?.is_visually_hidden_from_conversation || false;

  return role === "user" || role === "assistant" &&
    parts.length > 0 && parts[0].length && parts[0].length > 0 &&
    !isUserSystemMessage && !isVisuallyHidden;
}

function buildPathIds(mapping, currentNodeId) {
  const ids = [];
  let cur = currentNodeId;

  while (cur && mapping[cur]) {
    ids.push(cur);
    cur = mapping[cur].parent;
  }
  ids.reverse(); // 古い→新しい順に変更

  return ids;
}

function findRootId(mapping) {
  // ありがちな "root" があればそれ優先
  if (mapping.root) {
    return "root";
  }
  if (mapping["client-created-root"]) {
    return "client-created-root";
  }

  // parent が null / undefined な node を root 扱い
  for (const [id, node] of Object.entries(mapping)) {
    if (node && node.parent == null) {
      return id;
    }
  }

  return null;
}

function findFirstUserAndAssistantPair(pathIds, mapping) {
  // system/tool を無視して「最初の user」と「その直後の assistant」を探す
  let firstUserId = null;
  let firstAssistantId = null;

  for (let i = 0; i < pathIds.length; i++) {
    const id = pathIds[i];
    const r = roleOf(mapping[id]);

    if (!firstUserId && r === "user") {
      firstUserId = id;
      // 直後から assistant を探す
      for (let j = i + 1; j < pathIds.length; j++) {
        const id2 = pathIds[j];
        const m2 = mapping[id2];
        const r2 = roleOf(m2);
        const parts2 = m2?.message?.content?.parts || [];

        if (r2 === "assistant" && parts2.length > 0) {
          firstAssistantId = id2;
          break;
        }
      }
      break;
    }
  }

  return { firstUserId, firstAssistantId };
}

function pruneConversation(payload, keepTailCount) {
  if (keepTailCount == null || typeof(keepTailCount) !== 'number') {
    return payload;
  }
  if (keepTailCount <= 0) {
    return payload;
  }

  const mapping = payload?.mapping;
  const current = payload?.current_node;

  if (!mapping || !current || !mapping[current]) {
    return payload;
  }

  const rootId = findRootId(mapping);

  if (!rootId || !mapping[rootId]) {
    return payload;
  }

  const pathIds = buildPathIds(mapping, current);
  const { firstUserId, firstAssistantId } = findFirstUserAndAssistantPair(pathIds, mapping); // 最初の 1 往復（user + assistant）

  if (!firstUserId || !firstAssistantId) {
    return payload;
  }

  // keep セットを作る（親も含めて木構造が壊れないようにする）
  const keep = new Set();
  let earliestKept = current;

  keep.add(rootId);
  keep.add(firstUserId);
  keep.add(firstAssistantId);
  {
    let id = current;
    let keptCount = 0;

    while (id && mapping[id]) {
      if (id === firstAssistantId || id === firstUserId || id === rootId) {
        return payload;
      }

      keep.add(id);
      earliestKept = id;
      if (isTurnNode(mapping[id])) {
        keptCount++;
        if (keptCount >= keepTailCount) {
          break;
        }
      }
      id = mapping[id].parent;
    }
  }

  function fixRelation(targetNodeId, parentNodeId) {
    mapping[targetNodeId].parent = parentNodeId;

    const parentNode = mapping[parentNodeId];
    parentNode.children = Array.isArray(parentNode.children) ? parentNode.children : [];
    if (!parentNode.children.includes(targetNodeId)) {
      parentNode.children.push(earliestKept);
    }
  }

  fixRelation(earliestKept, firstAssistantId);
  fixRelation(firstAssistantId, firstUserId);
  fixRelation(firstUserId, rootId);

  // mapping を削る前に parent/children を keep のみに正規化
  for (const kid of keep) {
    const node = mapping[kid];
    if (!node) {
      continue;
    }
    if (Array.isArray(node.parent)) {
      node.parent = node.parent.filter(c => keep.has(c));
    }
    if (Array.isArray(node.children)) {
      node.children = node.children.filter(c => keep.has(c));
    }
  }

  // 最終的に keep 以外を落とす
  for (const id of Object.keys(mapping)) {
    if (!keep.has(id)) {
      delete mapping[id];
    }
  }

  return payload;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "FETCH_REQUEST") {
    return;
  }

  (async () => {
    const r = msg.request;
    const headers = new Headers();

    for (const [k, v] of r.headers || []) {
      headers.append(k, v);
    }

    const res = await fetch(r.url, {
      method: r.method,
      headers,
      body: r.body ? new Uint8Array(r.body) : undefined,
      credentials: r.credentials || "include",
      redirect: r.redirect || "follow",
      cache: r.cache || "default",
      mode: r.mode || "cors"
    });

    const outHeaders = [];
    res.headers.forEach((v, k) => outHeaders.push([k, v]));

    const buf = await res.arrayBuffer();
    let outText;

    try {
      const { 'keep-tail-count': keepTailCount = 50 } = await chrome.storage.sync.get({ 'keep-tail-count': 50 });
      const text = new TextDecoder().decode(buf);
      const json = JSON.parse(text);
      const pruned = pruneConversation(json, keepTailCount);
      outText = JSON.stringify(pruned);

      // Content-Length が付いてるとズレるので消す
      for (let i = outHeaders.length - 1; i >= 0; i--) {
        if (outHeaders[i][0].toLowerCase() === "content-length") {
          outHeaders.splice(i, 1);
        }
      }
    } catch {
      // パース失敗は素通し（壊すよりはマシ）
      outText = text;
    }

    sendResponse({
      response: {
        status: res.status,
        statusText: res.statusText,
        headers: outHeaders,
        body: outText
      }
    });
  })().catch((e) => {
    sendResponse({ response: null, error: String(e?.message || e) });
  });

  return true;
});
