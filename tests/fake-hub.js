// A stand-in for the Hoard Link hub: the events this app posts, the pages its web service fetches and the tool calls it proxies.
import http from "node:http";

export async function startFakeHub({ web = null } = {}) {
  const state = {
    events: [],     // posted to /api/events: { type, source, data }
    fetches: [],    // payloads of POST /api/web/fetch
    calls: [],      // proxied tool calls: { app, tool, arguments }
    tools: {},      // "app.tool" -> (arguments) => result, or { __error: { status, error } }
    web,            // (payload) => answer of /api/web/fetch; null: the hub has no web service
  };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      const url = new URL(req.url, "http://hub");
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
      const send = (status, payload) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(payload)); };
      if (req.method === "POST" && url.pathname === "/api/events") { state.events.push(body); return send(200, { ok: true }); }
      if (req.method === "GET" && url.pathname === "/api/web/status") return state.web ? send(200, { ok: true, enabled: true }) : send(404, { error: "not found" });
      if (req.method === "POST" && url.pathname === "/api/web/fetch" && state.web) {
        state.fetches.push(body);
        const answer = state.web(body);
        return send(answer.http ?? 200, answer.body ?? answer);
      }
      const proxy = url.pathname.match(/^\/api\/apps\/([^/]+)\/call$/);
      if (req.method === "POST" && proxy) {
        const fn = state.tools[`${proxy[1]}.${body.tool}`];
        if (!fn) return send(404, { ok: false, app: proxy[1], tool: body.tool, status: 404, error: "unknown tool" });
        state.calls.push({ app: proxy[1], tool: body.tool, arguments: body.arguments });
        const result = fn(body.arguments);
        if (result && result.__error) return send(200, { ok: false, app: proxy[1], tool: body.tool, status: result.__error.status, error: result.__error.error });
        return send(200, { ok: true, app: proxy[1], tool: body.tool, status: 200, result });
      }
      return send(404, { error: "not found" });
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    state,
    stop: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }),
    ofType: (type) => state.events.filter((e) => e.type === type),
  };
}
