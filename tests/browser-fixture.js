/* Local-only fixture: no production tokens, files or paid API calls. */
(function () {
  const user = { id: 'fixture-owner', email: 'preview@example.test' };
  const rows = [{ id: 'fixture-model', kind: 'model', owner_id: user.id, deleted: false, created_at: '2026-01-01T00:00:00Z', data: { name: 'Modelo de teste', identity: 'Fixture identity', photo: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#8fd3ff"/></svg>') } }];
  for (let i = 0; i < 45; i++) rows.push({ id: 'fixture-batch-' + i, owner_id: user.id, kind: 'batch', deleted: false, created_at: new Date(Date.UTC(2026, 0, 46 - i)).toISOString(), data: { modelId: 'fixture-model', modelName: 'Modelo de teste', mode: 'direct', files: [], outputs: 1, resolution: '480p', ratio: '9:16', duration: 5, status: 'draft', jobs: [] } });
  class Query {
    constructor(table) { this.table = table; this.filters = []; this.start = 0; this.end = Infinity; }
    select(columns, options) { this.head=!!options?.head; return this; } order() { return this; }
    limit(n) { this.end=n-1; return this; }
    eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
    range(start, end) { this.start = start; this.end = end; return this; }
    maybeSingle() { return Promise.resolve({ data: { direct_prompt: 'Saved direct fixture', frame_prompt: 'Saved frame fixture' } }); }
    then(resolve, reject) { return Promise.resolve({ data: this.table==='frame_shared'?[]:this.head?null:rows.filter(row => this.filters.every(filter => filter(row))).slice(this.start, this.end + 1), count: rows.filter(row=>this.filters.every(filter=>filter(row))).length }).then(resolve, reject); }
  }
  const client = {
    auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-session' } } }), getUser: async () => ({ data: { user } }), onAuthStateChange() {}, signOut: async () => ({}) },
    channel:()=>({on(){return this;},subscribe(){return this;}}),
    from: table => new Query(table), storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: '' } }) }) }
  };
  window.supabase = { createClient: () => client };
})();
