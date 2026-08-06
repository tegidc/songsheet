#!/usr/bin/env node
// Standalone backfill script — not part of the app.
//
// Every object-writing entry composed inside a song (song.objectWritings) that has
// never been mirrored to standalone_ow (no cloudId) is invisible to the cloud/sidebar.
// This finds those entries, reports what it would do, and stops. Only with --go does
// it actually write.
//
// Same identical-body check as syncObjectWritingsToCloud (src/app/App.tsx): a
// candidate entry might actually be a pre-Phase-2 import that predates the
// `imported` flag, not a genuinely new writing. If a standalone_ow row with an
// identical body already exists, the entry is adopted as loose (imported: true,
// sourceId = the matching row, no insert) instead of being inserted as a duplicate
// linked row. Only entries with no existing match get inserted as linked, with
// cloudId (and origin_song_id) stamped back onto the song — so re-running is
// idempotent either way.
//
// Usage:
//   node scripts/backfill-ow.mjs            # dry run — report only
//   node scripts/backfill-ow.mjs --go        # actually insert
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
  const words = text.trim().split(/\s+/);
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
}

async function main() {
  const { email, password } = await getCredentials();
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.user) {
    console.error("Sign-in failed:", authError?.message ?? "unknown error");
    process.exit(1);
  }
  const userId = authData.user.id;

  const { data: projects, error: projErr } = await supabase.from("projects").select("id, name, data");
  if (projErr) { console.error("Failed to fetch projects:", projErr.message); process.exit(1); }

  const { data: standalone, error: standaloneErr } = await supabase.from("standalone_ow").select("id, seed_word, body, written_at");
  if (standaloneErr) { console.error("Failed to fetch standalone_ow:", standaloneErr.message); process.exit(1); }

  // Group candidates by project so the (optional) write phase can batch one update per song.
  const byProject = new Map(); // projectId -> { name, song, entries: OWEntry[] }
  for (const project of projects ?? []) {
    const song = project.data ?? {};
    const entries = (song.objectWritings ?? []).filter(e => !e.cloudId && !e.imported && e.text && e.text.trim());
    if (entries.length === 0) continue;
    byProject.set(project.id, { name: project.name, song, entries });
  }

  const totalEntries = [...byProject.values()].reduce((n, p) => n + p.entries.length, 0);
  console.log(`Found ${totalEntries} object-writing ${totalEntries === 1 ? "entry" : "entries"} across ${byProject.size} songs with no cloudId, not imported, and non-empty body.\n`);

  // Exact-body match against existing standalone_ow rows — same check as
  // syncObjectWritingsToCloud. A match means "adopt as loose", not "insert".
  const findExactMatch = body => (standalone ?? []).find(s => s.body === body);

  let willAdopt = 0, willInsert = 0;
  for (const [, { name, entries }] of byProject) {
    for (const entry of entries) {
      const seed = entry.seedWord?.trim() || "(no seed word)";
      const match = findExactMatch(entry.text);
      if (match) {
        willAdopt++;
        console.log(`- [${name}] "${seed}" — ${wordsPreview(entry.text)}`);
        console.log(`    ADOPT AS LOOSE — identical body already exists as standalone_ow row ${match.id}`);
      } else {
        willInsert++;
        console.log(`- [${name}] "${seed}" — ${wordsPreview(entry.text)}`);
        console.log(`    INSERT AS LINKED — no existing match`);
      }
    }
  }
  console.log(`\n${willInsert} to insert as linked, ${willAdopt} to adopt as loose.`);

  // Suspected duplicates against existing standalone_ow rows that are NOT exact
  // matches — same seed word, or the same opening ~40 characters of body. Reported
  // only, for entries that will be inserted; no automatic deduplication.
  console.log("\nOther suspected (non-exact) duplicates among entries to be inserted:");
  let dupCount = 0;
  for (const [, { name, entries }] of byProject) {
    for (const entry of entries) {
      if (findExactMatch(entry.text)) continue; // already handled as an adoption above
      const seed = entry.seedWord?.trim().toLowerCase();
      const bodyStart = entry.text.trim().slice(0, 40).toLowerCase();
      const match = (standalone ?? []).find(s => {
        const sSeed = s.seed_word?.trim().toLowerCase();
        const sBodyStart = (s.body ?? "").trim().slice(0, 40).toLowerCase();
        return (seed && sSeed === seed) || (bodyStart && sBodyStart === bodyStart);
      });
      if (match) {
        dupCount++;
        console.log(`- [${name}] "${entry.seedWord ?? "(no seed word)"}" resembles standalone_ow row ${match.id} ("${match.seed_word ?? "(no seed word)"}") — not an exact body match, reported only`);
      }
    }
  }
  if (dupCount === 0) console.log("(none found)");

  if (!GO) {
    console.log("\nDry run only — re-run with --go to write.");
    process.exit(0);
  }

  console.log("\nWriting…");
  for (const [projectId, { name, song, entries }] of byProject) {
    let updatedEntries = song.objectWritings;
    for (const entry of entries) {
      const match = findExactMatch(entry.text);
      if (match) {
        updatedEntries = updatedEntries.map(e => e.id === entry.id ? { ...e, imported: true, sourceId: match.id } : e);
        console.log(`  Adopted entry ${entry.id} as loose (source ${match.id}) in "${name}"`);
        continue;
      }
      const seedWord = entry.seedWord?.trim() || null;
      const { data, error } = await supabase.from("standalone_ow")
        .insert({ user_id: userId, seed_word: seedWord, body: entry.text, origin_song_id: projectId })
        .select("id").single();
      if (error) {
        console.error(`  Failed to insert entry ${entry.id} from project ${projectId}:`, error.message);
        continue;
      }
      updatedEntries = updatedEntries.map(e => e.id === entry.id ? { ...e, cloudId: data.id } : e);
      console.log(`  Inserted ${data.id} for entry ${entry.id} (project ${projectId})`);
    }
    const { error: updateErr } = await supabase.from("projects")
      .update({ data: { ...song, objectWritings: updatedEntries } })
      .eq("id", projectId);
    if (updateErr) {
      console.error(`  Failed to update project ${projectId}:`, updateErr.message);
    }
  }
  console.log("Done.");
}

main();
