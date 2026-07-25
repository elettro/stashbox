#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const contractPath = path.join(repoRoot, 'radio/dev/v2/v2-stability-contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const entryPath = path.join(repoRoot, contract.entry);
const html = fs.readFileSync(entryPath, 'utf8');
const failures = [];
const passes = [];

const pass = message => passes.push(message);
const fail = message => failures.push(message);
const withoutVersion = value => String(value || '').split(/[?#]/, 1)[0];

const scriptSources = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
const stylesheetSources = [...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map(match => match[1]);
const localScripts = scriptSources.map(withoutVersion).filter(source => source.startsWith('/radio/dev/v2/'));
const localStyles = stylesheetSources.map(withoutVersion).filter(source => source.startsWith('/radio/dev/v2/'));

const buildPattern = new RegExp(`<meta\\s+name=["']${contract.buildMetaName}["']\\s+content=["']([^"']+)["']`, 'i');
const buildMatch = html.match(buildPattern);
if (buildMatch?.[1]) pass(`Build marker present: ${buildMatch[1]}`);
else fail(`Missing meta[name="${contract.buildMetaName}"] build marker.`);

for (const required of contract.requiredCoreScripts) {
  const positions = localScripts.reduce((result, source, index) => {
    if (source === required) result.push(index);
    return result;
  }, []);
  if (positions.length === 1) pass(`Required core script present once: ${required}`);
  else fail(`Required core script must appear exactly once: ${required}. Found ${positions.length}.`);
}

const corePositions = contract.requiredCoreScripts.map(required => localScripts.indexOf(required));
if (corePositions.every(position => position >= 0) && corePositions.every((position, index) => index === 0 || position > corePositions[index - 1])) {
  pass('Required core scripts are in the approved boot order.');
} else {
  fail(`Required core script order is invalid. Expected: ${contract.requiredCoreScripts.join(' -> ')}`);
}

const duplicates = [...new Set(localScripts.filter((source, index) => localScripts.indexOf(source) !== index))];
if (duplicates.length) fail(`Duplicate V2 script references: ${duplicates.join(', ')}`);
else pass('No duplicate V2 script references.');

const localResources = [...new Set([...localScripts, ...localStyles])];
for (const resource of localResources) {
  const filePath = path.join(repoRoot, resource.replace(/^\//, ''));
  if (!fs.existsSync(filePath)) {
    fail(`Referenced resource does not exist: ${resource}`);
    continue;
  }
  if (fs.statSync(filePath).size === 0) {
    fail(`Referenced resource is empty: ${resource}`);
    continue;
  }
  pass(`Resource exists: ${resource}`);

  if (resource.endsWith('.js')) {
    const check = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
    if (check.status === 0) pass(`JavaScript syntax valid: ${resource}`);
    else fail(`JavaScript syntax failed: ${resource}\n${check.stderr || check.stdout}`);
  }
}

if (!html.includes('id="v2App"')) fail('V2 entry is missing #v2App.');
else pass('V2 app mount exists.');

console.log('Stashbox Radio V2 entry validation');
console.log(`Entry: ${contract.entry}`);
console.log(`Scripts: ${localScripts.length}`);
console.log(`Stylesheets: ${localStyles.length}`);
console.log('');
for (const message of passes) console.log(`[PASS] ${message}`);
for (const message of failures) console.error(`[FAIL] ${message}`);

if (failures.length) {
  console.error(`\nV2 entry validation failed with ${failures.length} problem(s).`);
  process.exit(1);
}

console.log('\nV2 entry validation passed.');
