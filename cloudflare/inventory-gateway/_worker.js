// Pages hostname for browsers whose network cannot validate workers.dev TLS.
// The service binding invokes the inventory Worker without a public network hop.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/v1/stock-direct' && url.pathname !== '/v1/receipt-direct') {
      return new Response('Not found', { status: 404 });
    }
    if (!env.INVENTORY) return new Response('Service unavailable', { status: 503 });
    return env.INVENTORY.fetch(new Request('https://internal' + url.pathname + url.search, request));
  }
};
