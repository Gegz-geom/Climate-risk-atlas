/* ============================================================
   DATA LOADER
   Pulls per-league venue/hazard data straight from /data/*.csv at
   runtime, using PapaParse. Update or replace any CSV in /data —
   the app re-reads it on next load. Nothing here is hardcoded.
   Swap in a real Excel export at any time: save it as CSV (File >
   Save As > CSV) and drop it in over the existing file — same
   column headers, same result.
   ============================================================ */

const LEAGUES = ["NBA", "NHL", "MLB", "NFL", "MLS", "WNBA", "NWSL"];
const DATA_PATH = "data";

const RISK_ORDER = { "Negligible": 0, "Low": 1, "Moderate": 2, "High": 3 };
const NON_HAZARD_COLS = new Set(["Franchise", "Facility", "City", "Country", "Latitude", "Longitude", "Peak Risk"]);

const DataLoader = {
  cache: {},

  async load(league) {
    if (this.cache[league]) return this.cache[league];
    const res = await fetch(`${DATA_PATH}/${league.toLowerCase()}.csv`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load data for ${league}`);
    const text = await res.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });

    const fieldnames = parsed.meta.fields;
    const hazardFields = fieldnames.filter(f => !NON_HAZARD_COLS.has(f));

    const teams = parsed.data.map(row => {
      const hazards = hazardFields.map(name => {
        const level = (row[name] || "Negligible").trim();
        const score = RISK_ORDER[level] ?? 0;
        return { name, level, score };
      });
      const hazardCount = hazards.filter(h => h.score >= 2).length;
      return {
        franchise: row["Franchise"],
        facility: row["Facility"],
        city: row["City"],
        country: row["Country"],
        lat: parseFloat(row["Latitude"]),
        lon: parseFloat(row["Longitude"]),
        peakRisk: row["Peak Risk"],
        hazards,
        hazardCount
      };
    }).filter(t => t.franchise);

    const result = { league, hazardFields, teams };
    this.cache[league] = result;
    return result;
  },

  async loadAll() {
    const entries = await Promise.all(LEAGUES.map(l => this.load(l).then(d => [l, d])));
    return Object.fromEntries(entries);
  }
};
