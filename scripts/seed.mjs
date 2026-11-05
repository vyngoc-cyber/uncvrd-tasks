// Seeds profiles and projects from data/users.csv and data/projects.csv.
// Usage: put NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, then `npm run seed`.
// Safe to re-run: rows are matched by email (users) and name + parent (projects).
import { readFileSync, existsSync } from "node:fs";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const read = (f) => Papa.parse(readFileSync(f, "utf8"), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_") }).data;

// ---- users ----
const users = read(process.argv[2] ?? "data/users.csv").map((u) => ({
  name: (u.name ?? "").trim(),
  email: (u.email ?? "").trim().toLowerCase(),
  job_role: (u.job_role ?? "").trim() || null,
  is_manager: /^(true|yes|y|1|manager)$/i.test((u.is_manager ?? "").trim()),
}));
const badUsers = users.filter((u) => !u.name || !u.email.endsWith("@uncvrd.com"));
if (badUsers.length) console.warn("Skipping users with no name or a non-@uncvrd.com email:", badUsers.map((u) => u.email || u.name));
const goodUsers = users.filter((u) => !badUsers.includes(u));
if (goodUsers.length) {
  const { error } = await sb.from("profiles").upsert(goodUsers, { onConflict: "email" });
  if (error) throw error;
}
console.log(`Users: ${goodUsers.length} upserted`);

// ---- projects (parents first, then children) ----
const rows = read(process.argv[3] ?? "data/projects.csv").map((p) => ({ name: (p.name ?? "").trim(), parent: (p.parent ?? "").trim() }));
const { data: existing, error: e1 } = await sb.from("projects").select("id,name,parent_id");
if (e1) throw e1;
const idOf = (name, parentId) => existing.find((p) => p.name === name && (p.parent_id ?? null) === (parentId ?? null))?.id;
let created = 0;
async function ensure(name, parentId) {
  const found = idOf(name, parentId);
  if (found) return found;
  const { data, error } = await sb.from("projects").insert({ name, parent_id: parentId ?? null }).select().single();
  if (error) throw error;
  existing.push(data);
  created++;
  return data.id;
}
for (const r of rows.filter((r) => r.name && !r.parent)) await ensure(r.name, null);
for (const r of rows.filter((r) => r.name && r.parent)) {
  const parentId = idOf(r.parent, null) ?? (await ensure(r.parent, null));
  await ensure(r.name, parentId);
}
console.log(`Projects: ${created} created, ${rows.length - created} already existed`);
