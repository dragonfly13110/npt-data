import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PUBLIC_POWERBI_DATASETS, readPowerbiPage } from './datasets.mjs';
import {
  PUBLIC_SITUATION_DATASETS,
  collectPublicSituation,
} from './public-situation.mjs';

export const PAGES_TABLES = [
  'farmer_registry',
  'farmer_registry_subdistricts',
  'farmer_registry_snapshots',
  'farmer_registry_subdistrict_snapshots',
  'geoplots_parcel_progress',
  'geoplots_parcel_subdistrict_progress',
  'certifications',
];

export async function collectPagesSnapshot(client) {
  const fetchedAt = new Date().toISOString();
  const tables = {};
  // ponytail: one daily batch, no per-viewer database reads; fail before publishing any table.
  for (const name of PAGES_TABLES) {
    const definition = PUBLIC_POWERBI_DATASETS[name];
    const data = [];
    let offset = 0;
    let expected;
    do {
      const page = await readPowerbiPage(client, {
        definition,
        offset,
        limit: 1000,
      });
      if (
        page.count > 100000 ||
        (expected !== undefined && expected !== page.count)
      )
        throw new Error(`Unstable or oversized source: ${name}`);
      expected = page.count;
      if (
        page.data.some((row) =>
          Object.values(row).some(
            (value) =>
              value !== null &&
              !['string', 'number', 'boolean'].includes(typeof value)
          )
        )
      )
        throw new Error(`Unexpected nested data: ${name}`);
      data.push(...page.data);
      offset = page.nextOffset;
    } while (offset !== null);
    if (data.length !== expected) throw new Error(`Incomplete source: ${name}`);
    tables[name] = {
      schemaVersion: 1,
      table: name,
      status: expected ? 'ready' : 'empty',
      fetchedAt,
      count: expected,
      data,
    };
  }
  return { fetchedAt, tables };
}

export function makePowerQuery(name) {
  if (Object.hasOwn(PUBLIC_SITUATION_DATASETS, name)) {
    const types = PUBLIC_SITUATION_DATASETS[name].types;
    return `let
    Raw = Json.Document(Web.Contents("https://dragonfly13110.github.io", [RelativePath = "npt-data/data/bi/${name}.json"])),
    Checked = if Raw[schemaVersion] <> 1 or Raw[table] <> "${name}" or not List.Contains({"ready", "empty"}, Raw[status]) then error "Invalid public snapshot" else Raw[data],
    Rows = Table.FromRecords(Checked, {${Object.keys(types)
      .map((key) => JSON.stringify(key))
      .join(', ')}}, MissingField.Error),
    Typed = if Table.RowCount(Rows) <> Raw[count] then error "Incomplete public snapshot" else Table.TransformColumnTypes(Rows, {${Object.entries(
      types
    )
      .map(([key, type]) => `{${JSON.stringify(key)}, type ${type}}`)
      .join(', ')}}, "en-US")
in
    Typed
`;
  }
  if (!PAGES_TABLES.includes(name)) throw new Error('Unknown Pages table');
  const definition = PUBLIC_POWERBI_DATASETS[name];
  const modelPath = path.resolve(
    `powerbi/npt-agriculture-hybrid/NPTAgricultureHybrid.SemanticModel/definition/tables/Own_${name}.tmdl`
  );
  const model = fs.readFileSync(modelPath, 'utf8');
  const types = definition.columns.map((column) => {
    const match = model.match(
      new RegExp(`^\\tcolumn '?${column}'?\\r?\\n\\t\\tdataType: (\\w+)`, 'm')
    );
    if (!match || !['double', 'string'].includes(match[1]))
      throw new Error(`Missing or unsupported model type: ${name}.${column}`);
    return `{${JSON.stringify(column)}, type ${match[1] === 'double' ? 'number' : 'text'}}`;
  });
  return `let
    Raw = Json.Document(Web.Contents("https://dragonfly13110.github.io", [RelativePath = "npt-data/data/bi/${name}.json"])),
    Checked = if Raw[schemaVersion] <> 1 or Raw[table] <> "${name}" or not List.Contains({"ready", "empty"}, Raw[status]) then error "Invalid BI snapshot" else Raw[data],
    Rows = Table.FromRecords(Checked, {${definition.columns.map((column) => JSON.stringify(column)).join(', ')}}, MissingField.Error),
    Typed = if Table.RowCount(Rows) <> Raw[count] then error "Incomplete BI snapshot" else Table.TransformColumnTypes(Rows, {${types.join(', ')}}, "en-US")
in
    Typed
`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      'output-dir': { type: 'string', default: 'output/bi-pages' },
      'queries-only': { type: 'boolean', default: false },
      'no-queries': { type: 'boolean', default: false },
    },
  });
  const output = path.resolve(values['output-dir']);
  const queries = values['no-queries']
    ? {}
    : Object.fromEntries(
        [...PAGES_TABLES, ...Object.keys(PUBLIC_SITUATION_DATASETS)].map(
          (name) => [name, makePowerQuery(name)]
        )
      );
  if (!values['queries-only']) {
    if (fs.existsSync('.env')) process.loadEnvFile('.env');
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key =
      process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key || !/^https:\/\//.test(url))
      throw new Error('Missing HTTPS Supabase URL or read-only key');
    if (
      key.startsWith('sb_secret_') ||
      (key.split('.').length === 3 &&
        JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
          .role !== 'anon')
    )
      throw new Error(
        'Use an anonymous/publishable key, never a privileged key'
      );
    // A small REST reader keeps the public scheduled exporter independent of the private app/dependencies.
    const client = {
      from: (table) => ({
        select: (columns) => ({
          order: (column) => ({
            range: async (start, end) => {
              const endpoint = new URL(`/rest/v1/${table}`, url);
              endpoint.searchParams.set('select', columns);
              endpoint.searchParams.set('order', `${column}.asc`);
              endpoint.searchParams.set('offset', String(start));
              endpoint.searchParams.set('limit', String(end - start + 1));
              const response = await fetch(endpoint, {
                headers: {
                  apikey: key,
                  ...(!key.startsWith('sb_publishable_')
                    ? { Authorization: `Bearer ${key}` }
                    : {}),
                  Prefer: 'count=exact',
                },
                signal: AbortSignal.timeout(30000),
              });
              if (!response.ok) throw new Error('Public dataset unavailable');
              const total = response.headers
                .get('content-range')
                ?.split('/')
                .at(-1);
              return {
                data: await response.json(),
                count: total && total !== '*' ? Number(total) : null,
                error: null,
              };
            },
          }),
        }),
      }),
    };
    const snapshot = await collectPagesSnapshot(client);
    Object.assign(
      snapshot.tables,
      await collectPublicSituation(client, snapshot.fetchedAt)
    );
    const files = Object.entries(snapshot.tables).map(([name, table]) => {
      const content = JSON.stringify(table) + '\n';
      const bytes = Buffer.byteLength(content);
      if (bytes > 10 * 1024 * 1024)
        throw new Error(`Snapshot exceeds 10 MiB: ${name}`);
      return { name, table, content, bytes };
    });
    const manifest = {
      schemaVersion: 1,
      fetchedAt: snapshot.fetchedAt,
      tables: files.map(({ name, table, content, bytes }) => ({
        table: name,
        title: (
          PUBLIC_POWERBI_DATASETS[name] || PUBLIC_SITUATION_DATASETS[name]
        ).title,
        status: table.status,
        count: table.count,
        fetchedAt: table.fetchedAt,
        bytes,
        sha256: createHash('sha256').update(content).digest('hex'),
      })),
    };
    fs.mkdirSync(output, { recursive: true });
    for (const { name, content } of files)
      fs.writeFileSync(path.join(output, `${name}.json`), content);
    fs.writeFileSync(
      path.join(output, 'manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n'
    );
    console.log(
      JSON.stringify({
        fetchedAt: snapshot.fetchedAt,
        tables: files.length,
        bytes: files.reduce((total, file) => total + file.bytes, 0),
      })
    );
  }
  if (values['no-queries']) return;
  const queryDir = path.join(output, 'power-query');
  fs.mkdirSync(queryDir, { recursive: true });
  for (const [name, query] of Object.entries(queries))
    fs.writeFileSync(path.join(queryDir, `Own_${name}.pq`), query);
  fs.writeFileSync(
    path.join(queryDir, 'BI_SourceStatus.pq'),
    `let
    Raw = Json.Document(Web.Contents("https://dragonfly13110.github.io", [RelativePath = "npt-data/data/bi/manifest.json"])),
    Rows = if Raw[schemaVersion] <> 1 then error "Invalid BI manifest" else Table.FromRecords(Raw[tables]),
    Typed = Table.TransformColumnTypes(Rows, {{"fetchedAt", type datetimezone}, {"count", Int64.Type}, {"bytes", Int64.Type}})
in
    Typed
`
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(() => {
    console.error(
      'BI export failed. No new batch should be published; check configuration, source availability and schema.'
    );
    process.exitCode = 1;
  });
}
