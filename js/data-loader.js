/* ============================================================
   DATA LOADER
   Pulls per-league venue/hazard data from /data/*.json at runtime.
   Nothing here is hardcoded — swap or update the JSON files in
   /data and the app reflects it on next load. No rebuild needed.
   ============================================================ */

const LEAGUES = ["NBA", "NHL", "MLB", "NFL", "MLS", "WNBA", "NWSL"];
const DATA_PATH = "data";

const DataLoader = {
  cache: {},

  async load(league) {
    if (this.cache[league]) return this.cache[league];
    const res = await fetch(`${DATA_PATH}/${league.toLowerCase()}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load data for ${league}`);
    const json = await res.json();
    this.cache[league] = json;
    return json;
  },

  async loadAll() {
    const entries = await Promise.all(LEAGUES.map(l => this.load(l).then(d => [l, d])));
    return Object.fromEntries(entries);
  }
};
