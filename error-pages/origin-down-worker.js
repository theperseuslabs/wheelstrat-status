// Cloudflare Worker for wheelstrategyoptions.com: shows a branded "temporarily
// unavailable" page, linking to the status page, when the VPS can't serve a
// page. Custom error pages need a paid Cloudflare plan; this does the same job
// on the free one.
//
// Routes: wheelstrategyoptions.com/* and www.wheelstrategyoptions.com/*, both
// with the failure mode set to "Fail open", so the site keeps working if the
// free tier's daily request limit runs out.
//
// Every other request and response passes through untouched.

// 502-504 come from the proxy on the VPS when the app behind it is down;
// 520-527 and 530 are Cloudflare's own "origin unreachable" errors.
const ORIGIN_DOWN = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

// Only browser page loads get the page. API calls, Next.js data requests and
// assets keep their real error so client code can handle it.
function isPageLoad(request) {
  return request.method === "GET" && (request.headers.get("Accept") || "").includes("text/html");
}

function outagePage(request, originStatus) {
  const ray = request.headers.get("cf-ray") || "unavailable";
  return new Response(PAGE.replace("__RAY_ID__", ray), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      "X-Origin-Status": String(originStatus),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    // If this Worker itself throws, Cloudflare sends the request to the origin
    // as though the Worker were not there.
    ctx.passThroughOnException();

    const pageLoad = isPageLoad(request);
    // Lets us look at the page without taking the site down:
    // https://wheelstrategyoptions.com/?__preview_outage=1
    if (pageLoad && new URL(request.url).searchParams.has("__preview_outage")) {
      return outagePage(request, "preview");
    }
    let response;
    try {
      response = await fetch(request);
    } catch (err) {
      if (pageLoad) return outagePage(request, "unreachable");
      throw err;
    }
    if (pageLoad && ORIGIN_DOWN.has(response.status)) {
      return outagePage(request, response.status);
    }
    return response;
  },
};

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Temporarily unavailable | Wheel Strategy Options</title>
<style>
  :root { --bg:#000; --card:#0a0a0a; --border:#262626; --fg:#f5f5f5; --muted:#a1a1a1; --gold:#c6b57b; --up:#10b981; --down:#ef4444; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;
         background:var(--bg); color:var(--fg);
         font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height:1.5; }
  main { width:100%; max-width:520px; text-align:center; }
  img.logo { width:56px; height:56px; border-radius:50%; }
  .brand { margin:12px 0 32px; font-weight:600; letter-spacing:-0.01em; }
  h1 { margin:0 0 12px; font-size:28px; font-weight:800; letter-spacing:-0.02em; line-height:1.2; }
  p { margin:0 0 16px; color:var(--muted); }
  .status { margin:24px 0; padding:14px 16px; background:var(--card); border:1px solid var(--border);
            border-radius:8px; font-size:14px; color:var(--fg); display:flex; align-items:center; justify-content:center; gap:10px; }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--muted); flex:none; }
  .dot.up { background:var(--up); } .dot.down { background:var(--down); }
  .actions { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
  a.btn, button.btn { display:inline-block; padding:10px 20px; border-radius:6px; font:inherit; font-size:14px; font-weight:600;
                      text-decoration:none; cursor:pointer; border:1px solid var(--border); background:transparent; color:var(--fg); }
  a.btn.primary { background:var(--gold); border-color:var(--gold); color:#0a0a0a; }
  .retry { margin-top:20px; font-size:13px; }
  .tech { margin-top:40px; padding-top:20px; border-top:1px solid var(--border); font-size:12px; color:#737373; }
  .tech a { color:inherit; }
</style>
</head>
<body>
<main>
  <img class="logo" alt="" src="https://raw.githubusercontent.com/theperseuslabs/wheelstrat-status/master/assets/logo.png">
  <div class="brand">Wheel Strategy Options</div>

  <h1>We're temporarily unavailable</h1>
  <p>Our servers aren't responding right now. The problem is on our side, not with your device or connection, and we're working on it.</p>

  <div class="status" id="status"><span class="dot" id="dot"></span><span id="status-text">Checking current status…</span></div>

  <div class="actions">
    <a class="btn primary" href="https://status.wheelstrategyoptions.com">View live status</a>
    <button class="btn" onclick="location.reload()">Try again</button>
  </div>

  <p class="retry">This page retries automatically in <span id="countdown">60</span> seconds.</p>

  <div class="tech">
    Reference: __RAY_ID__
  </div>
</main>

<script>
  // Auto-retry: the origin usually comes back within minutes.
  var left = 60, el = document.getElementById("countdown");
  setInterval(function () {
    left -= 1;
    if (left <= 0) { location.reload(); return; }
    el.textContent = left;
  }, 1000);

  // Live status from the status repo (served by GitHub, not by our VPS).
  fetch("https://raw.githubusercontent.com/theperseuslabs/wheelstrat-status/master/history/summary.json", { cache: "no-store" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (sites) {
      var down = sites.filter(function (s) { return s.status !== "up"; }).map(function (s) { return s.name; });
      var dot = document.getElementById("dot"), text = document.getElementById("status-text");
      if (down.length) {
        dot.className = "dot down";
        text.textContent = "Confirmed outage: " + down.join(", ");
      } else {
        dot.className = "dot up";
        text.textContent = "Our monitors last saw every service up. This may be brief.";
      }
    })
    .catch(function () {
      document.getElementById("status-text").textContent = "See the status page for the latest.";
    });
</script>
</body>
</html>`;
