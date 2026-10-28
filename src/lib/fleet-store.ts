import { Pool } from 'pg';

const globalStore = globalThis as unknown as { hqAnalyticsPool?: Pool };
function reader() {
  if (!process.env.HQ_ANALYTICS_READER_URL) throw new Error('analytics_not_configured');
  if (!globalStore.hqAnalyticsPool) {
    const url = new URL(process.env.HQ_ANALYTICS_READER_URL);
    for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
    globalStore.hqAnalyticsPool = new Pool({connectionString:url.toString(),max:1,idleTimeoutMillis:15000,
      connectionTimeoutMillis:8000,query_timeout:10000,ssl:{rejectUnauthorized:true}});
    globalStore.hqAnalyticsPool.on('error', () => { /* errors surface as unavailable, never credentials */ });
  }
  return globalStore.hqAnalyticsPool;
}
export async function readFleet() {
  const client = await reader().connect();
  try {
    await client.query('BEGIN READ ONLY');
    const profiles = await client.query(`SELECT instance_id,profile_id,instance_name,profile_name,host_kind,notion_url FROM hq_analytics_v1.profiles ORDER BY instance_id DESC,profile_id`);
    const snapshots = await client.query(`SELECT instance_id,profile_id,kind,run_id,observed_at,ingested_at,schema_version,payload FROM hq_analytics_v1.snapshots ORDER BY observed_at DESC LIMIT 100`);
    await client.query('COMMIT');
    return {schemaVersion:1,checkedAt:new Date().toISOString(),profiles:profiles.rows,snapshots:snapshots.rows};
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { client.release(); }
}
