/**
 * Cloudflare Pages Function: GET /api/dns
 *
 * Proxy DNS over HTTPS (JSON) tới các resolver công cộng. Dùng khi trình duyệt
 * của người dùng bị chặn gọi thẳng cloudflare-dns.com / dns.google, hoặc khi
 * muốn mọi truy vấn đi qua một điểm duy nhất để log và cache tại edge.
 *
 * Tham số:
 *   name     – tên miền cần tra (bắt buộc)
 *   type     – loại bản ghi: A, AAAA, CNAME, MX, NS, TXT, CAA, SOA… (mặc định A)
 *   resolver – cloudflare | google | quad9 | adguard (mặc định cloudflare)
 *   cd       – "1" để tắt kiểm tra DNSSEC
 *
 * Trả về nguyên dạng JSON của resolver (RFC 8484 JSON API).
 */

const RESOLVERS = {
  cloudflare: { url: "https://cloudflare-dns.com/dns-query", accept: "application/dns-json" },
  google:     { url: "https://dns.google/resolve",           accept: "application/json" },
  quad9:      { url: "https://dns.quad9.net:5053/dns-query", accept: "application/dns-json" },
  adguard:    { url: "https://dns.adguard-dns.com/resolve",  accept: "application/json" },
};

const ALLOWED_TYPES = new Set([
  "A", "AAAA", "CNAME", "MX", "NS", "TXT", "SOA", "PTR", "SRV",
  "CAA", "DS", "DNSKEY", "TLSA", "SVCB", "HTTPS", "NAPTR",
]);

// Nhãn ASCII hoặc IDN đã punycode, tối đa 253 ký tự.
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z]{2,63}\.?$/i;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "accept, content-type",
  "access-control-max-age": "86400",
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...CORS,
      ...extra,
    },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") || "").trim().toLowerCase();
  const type = (url.searchParams.get("type") || "A").trim().toUpperCase();
  const key = (url.searchParams.get("resolver") || "cloudflare").trim().toLowerCase();
  const cd = url.searchParams.get("cd") === "1";

  if (!name) return json({ error: "Thiếu tham số name." }, 400);
  if (!HOST_RE.test(name)) return json({ error: "Tên miền không hợp lệ." }, 400);
  if (!ALLOWED_TYPES.has(type)) return json({ error: `Loại bản ghi không được hỗ trợ: ${type}` }, 400);

  const resolver = RESOLVERS[key];
  if (!resolver) return json({ error: `Resolver không hợp lệ: ${key}` }, 400);

  const upstream = new URL(resolver.url);
  upstream.searchParams.set("name", name);
  upstream.searchParams.set("type", type);
  if (cd) upstream.searchParams.set("cd", "1");

  const started = Date.now();
  let res;
  try {
    res = await fetch(upstream.toString(), {
      headers: { accept: resolver.accept },
      // Cache tại edge theo TTL ngắn để tránh hỏi lại resolver khi nhiều người
      // cùng mở trang; đặt 30s để trạng thái vẫn đủ tươi khi theo dõi cutover.
      cf: { cacheTtl: 30, cacheEverything: true },
    });
  } catch (err) {
    return json({ error: "Không gọi được resolver.", detail: String(err), resolver: key }, 502);
  }

  if (!res.ok) {
    return json({ error: `Resolver trả về HTTP ${res.status}.`, resolver: key }, 502);
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    return json({ error: "Resolver trả về dữ liệu không phải JSON.", resolver: key }, 502);
  }

  data._resolver = key;
  data._upstream_ms = Date.now() - started;

  return json(data, 200, {
    "cache-control": "public, max-age=15",
  });
}
