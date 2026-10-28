-- Additive analytics-only store. Executed once in a transaction by the existing owner.
CREATE SCHEMA hq_analytics_v1;
REVOKE ALL ON SCHEMA hq_analytics_v1 FROM PUBLIC;
CREATE TABLE hq_analytics_v1.profiles (
 instance_id text NOT NULL, profile_id text NOT NULL, instance_name text NOT NULL,
 profile_name text NOT NULL, host_kind text NOT NULL, notion_url text NOT NULL,
 PRIMARY KEY(instance_id,profile_id)
);
INSERT INTO hq_analytics_v1.profiles VALUES
 ('sporekeeper','default','Sporekeeper','Sporekeeper','VPS','https://app.notion.com/p/7d4a3803e8fb4010b79ed223869893d1'),
 ('sporekeeper','trading','Sporekeeper','Trader','VPS','https://app.notion.com/p/b8183845483f49ce94641fe599c33d83'),
 ('caretaker','default','Caretaker','Caretaker','NUC','https://app.notion.com/p/3de83dab860980658aa3ddd4d71f309e'),
 ('caretaker','researcher','Caretaker','Researcher','NUC','https://app.notion.com/p/40583dab8609817e9841fda85e2b4634');
CREATE TABLE hq_analytics_v1.snapshots (
 instance_id text NOT NULL, profile_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('runtime','trader')),
 run_id text NOT NULL CHECK(length(run_id) BETWEEN 1 AND 120),
 observed_at timestamptz NOT NULL CHECK(observed_at <= now()+interval '2 minutes'),
 ingested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 schema_version integer NOT NULL CHECK(schema_version=1),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=250000),
 PRIMARY KEY(instance_id,profile_id,kind,run_id),
 FOREIGN KEY(instance_id,profile_id) REFERENCES hq_analytics_v1.profiles,
 CHECK(kind!='trader' OR (instance_id='sporekeeper' AND profile_id='trading'))
);
ALTER TABLE hq_analytics_v1.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_analytics_v1.snapshots FORCE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA hq_analytics_v1 TO hq_reader_v1,hq_pub_spore_v1,hq_pub_care_v1;
GRANT SELECT ON hq_analytics_v1.profiles TO hq_reader_v1;
GRANT SELECT ON hq_analytics_v1.snapshots TO hq_reader_v1;
GRANT SELECT,INSERT,UPDATE ON hq_analytics_v1.snapshots TO hq_pub_spore_v1,hq_pub_care_v1;
CREATE POLICY reader ON hq_analytics_v1.snapshots FOR SELECT TO hq_reader_v1 USING(true);
CREATE POLICY spore ON hq_analytics_v1.snapshots TO hq_pub_spore_v1
 USING(instance_id='sporekeeper' AND profile_id IN ('default','trading'))
 WITH CHECK(instance_id='sporekeeper' AND profile_id IN ('default','trading'));
CREATE POLICY care ON hq_analytics_v1.snapshots TO hq_pub_care_v1
 USING(instance_id='caretaker' AND profile_id IN ('default','researcher'))
 WITH CHECK(instance_id='caretaker' AND profile_id IN ('default','researcher'));
-- Add identity to future command requests; historical records stay nullable.
ALTER TABLE public."AgentRequest" ADD COLUMN "instanceId" text;
ALTER TABLE public."AgentRequest" ADD COLUMN "profileId" text;
ALTER TABLE public."AgentRequest" ADD COLUMN "requestKey" text;
CREATE UNIQUE INDEX "AgentRequest_requestKey_key" ON public."AgentRequest"("requestKey");
