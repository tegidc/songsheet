#!/usr/bin/env node
// One-off repair script — not part of the app.
//
// Before the identical-body check was added to syncObjectWritingsToCloud, the mirror
// couldn't tell a pre-Phase-2 import (an OWEntry with no `cloudId` and no `imported`
// flag, because it predates both fields) from a genuinely new in-song writing. So it
// copied every such entry to standalone_ow as if it were new — producing a duplicate
// row (origin_song_id set) of a row that already existed (origin_song_id null,
// written earlier).
//
// For each standalone_ow row with origin_song_id set, if another row for the same user
// has an identical body, origin_song_id null, and an earlier written_at, the newer row
// is a mirror-created duplicate:
//   1. Delete the newer (duplicate) row.
//   2. In the song it references (origin_song_id), find the OWEntry with a matching
//      cloudId and convert it to loose: drop cloudId, set imported: true, sourceId =
//      the older row's id.
//
// Dry run by default; pass --go to actually delete + update.
//
// Usage:
//   node scripts/repair-ow-duplicates.mjs            # dry run — report only
//   node scripts/repair-ow-duplicates.mjs --go        # actually repair
//
// Credentials: reads SONGSHEET_EMAIL / SONGSHEET_PASSWORD from the environment if
// set, otherwise prompts interactively (visibly — this is a one-off admin script).

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const infoPath = join(__dirname, "..", "utils", "supabase", "info.tsx");
const infoSrc = readFileSync(infoPath, "utf8");
const projectIdMatch = infoSrc.match(/projectId = "([^"]+)"/);
const anonKeyMatch = infoSrc.match(/publicAnonKey = "([^"]+)"/);
if (!projectIdMatch || !anonKeyMatch) {
  console.error("Could not read Supabase project id / anon key from utils/supabase/info.tsx");
  process.exit(1);
}
const supabase = createClient(`https://${projectIdMatch[1]}.supabase.co`, anonKeyMatch[1]);

const GO = process.argv.includes("--go");

async function getCredentials() {
  if (process.env.SONGSHEET_EMAIL && process.env.SONGSHEET_PASSWORD) {
    return { email: process.env.SONGSHEET_EMAIL, password: process.env.SONGSHEET_PASSWORD };
  }
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const email = await rl.question("Email: ");
  const password = await rl.question("Password: ");
  rl.close();
  return { email, password };
}

function wordsPreview(text, n = 8) {
  const words = (text ?? "").trim().split(/\s+/);
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
}

async function main() {
  const { email, password } = await getCredentials();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) {
    console.error("Sign-in failed:", authError?.message ?? "unknown error");
    process.exit(1);
  }

  const { data: rows, error: rowsErr } = await supabase.from("standalone_ow")
    .select("id, seed_word, body, written_at, origin_song_id")
    .order("written_at", { ascending: true });
  if (rowsErr) { console.error("Failed to fetch standalone_ow:", rowsErr.message); process.exit(1); }

  console.log(`standalone_ow currently has ${rows.length} rows.\n`);

  // Find mirror-created duplicates: a row with origin_song_id set whose body matches
  // an older, origin-less row.
  const duplicates = []; // { dup: row, original: row }
  for (const row of rows) {
    if (!row.origin_song_id) continue;
    const original = rows.find(o =>
      o.id !== row.id &&
      o.origin_song_id === null &&
      o.body === row.body &&
      new Date(o.written_at).getTime() < new Date(row.written_at).getTime()
    );
    if (original) duplicates.push({ dup: row, original });
  }

  if (duplicates.length === 0) {
    console.log("No mirror-created duplicates found. Nothing to do.");
    process.exit(0);
  }

  console.log(`Found ${duplicates.length} mirror-created ${duplicates.length === 1 ? "duplicate" : "duplicates"}:\n`);
  for (const { dup, original } of duplicates) {
    const seed = dup.seed_word?.trim() || "(no seed word)";
    console.log(`- row ${dup.id} "${seed}" — ${wordsPreview(dup.body)}`);
    console.log(`    duplicate of row ${original.id} (written ${original.written_at}, origin_song_id null)`);
    console.log(`    dup written ${dup.written_at}, origin_song_id ${dup.origin_song_id}`);
  }

  // Locate the song entry that references each duplicate row via cloudId, so we know
  // what to patch. Fetch every project once, since duplicates may span several songs.
  const projectIds = [...new Set(duplicates.map(d => d.dup.origin_song_id))];
  const { data: projects, error: projErr } = await supabase.from("projects")
    .select("id, name, data")
    .in("id", projectIds);
  if (projErr) { console.error("Failed to fetch projects:", projErr.message); process.exit(1); }
  const projectById = new Map((projects ?? []).map(p => [p.id, p]));

  console.log("\nSong entries that will be converted to loose:");
  const plan = []; // { dup, original, project, entryId }
  for (const { dup, original } of duplicates) {
    const project = projectById.get(dup.origin_song_id);
    if (!project) {
      console.log(`- row ${dup.id}: referenced project ${dup.origin_song_id} not found (already deleted?) — will only delete the row.`);
      plan.push({ dup, original, project: null, entryId: null });
      continue;
    }
    const entries = project.data?.objectWritings ?? [];
    const entry = entries.find(e => e.cloudId === dup.id);
    if (!entry) {
      console.log(`- row ${dup.id}: no entry with matching cloudId found in "${project.name}" (already fixed?) — will only delete the row.`);
      plan.push({ dup, original, project, entryId: null });
      continue;
    }
    console.log(`- [${project.name}] entry ${entry.id}: drop cloudId, set imported: true, sourceId: ${original.id}`);
    plan.push({ dup, original, project, entryId: entry.id });
  }

  if (!GO) {
    console.log("\nDry run only — re-run with --go to delete the duplicate rows and convert the entries.");
    process.exit(0);
  }

  console.log("\nRepairing…");
  // Group by project so each song gets one update.
  const byProject = new Map(); // projectId -> { project, entryIds: Map<entryId, sourceId> }
  for (const { project, entryId, original } of plan) {
    if (!project || !entryId) continue;
    if (!byProject.has(project.id)) byProject.set(project.id, { project, fixes: new Map() });
    byProject.get(project.id).fixes.set(entryId, original.id);
  }
  for (const { project, fixes } of byProject.values()) {
    const updatedEntries = (project.data.objectWritings ?? []).map(e => {
      if (!fixes.has(e.id)) return e;
      const sourceId = fixes.get(e.id);
      const { cloudId, ...rest } = e;
      return { ...rest, imported: true, sourceId };
    });
    const { error: updateErr } = await supabase.from("projects")
      .update({ data: { ...project.data, objectWritings: updatedEntries } })
      .eq("id", project.id);
    if (updateErr) {
      console.error(`  Failed to update project ${project.id} ("${project.name}"):`, updateErr.message);
    } else {
      console.log(`  Updated "${project.name}" (${fixes.size} ${fixes.size === 1 ? "entry" : "entries"} converted to loose)`);
    }
  }

  for (const { dup } of plan) {
    const { error: delErr } = await supabase.from("standalone_ow").delete().eq("id", dup.id);
    if (delErr) {
      console.error(`  Failed to delete duplicate row ${dup.id}:`, delErr.message);
    } else {
      console.log(`  Deleted duplicate row ${dup.id}`);
    }
  }

  console.log("Done.");
}

main();
