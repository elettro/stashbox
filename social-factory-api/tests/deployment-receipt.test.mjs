import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));
const receiptScript = path.join(repositoryRoot, 'scripts', 'record-social-factory-dev-deployment-receipt.sh');
const reportPath = 'deployment-reports/social-factory-api-dev.json';
const runId = 'test-run-109';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
}

test('deployment receipt commits from a clean worktree and preserves installer changes', (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'social-factory-receipt-test-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  const remote = path.join(tempRoot, 'remote.git');
  const seed = path.join(tempRoot, 'seed');
  const checkout = path.join(tempRoot, 'checkout');
  const runnerTemp = path.join(tempRoot, 'runner-temp');
  fs.mkdirSync(seed);
  fs.mkdirSync(runnerTemp);

  git(['init', '--bare', '--quiet', '--initial-branch=main', remote], tempRoot);
  git(['init', '--quiet', '--initial-branch=main'], seed);
  git(['config', 'user.name', 'Receipt Test'], seed);
  git(['config', 'user.email', 'receipt-test@example.invalid'], seed);

  fs.mkdirSync(path.join(seed, 'scripts'), { recursive: true });
  fs.copyFileSync(receiptScript, path.join(seed, 'scripts', path.basename(receiptScript)));
  fs.mkdirSync(path.join(seed, 'social-factory-api', 'node_modules', 'example'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'social-factory-api', 'node_modules', 'example', 'index.js'), 'before install\n');
  fs.mkdirSync(path.dirname(path.join(seed, reportPath)), { recursive: true });
  fs.writeFileSync(path.join(seed, reportPath), JSON.stringify({ run_id: 'previous-run', status: 'success' }) + '\n');
  git(['add', '.'], seed);
  git(['commit', '--quiet', '-m', 'Seed clean main'], seed);
  git(['remote', 'add', 'origin', remote], seed);
  git(['push', '--quiet', '-u', 'origin', 'main'], seed);
  git(['clone', '--quiet', remote, checkout], tempRoot);

  const installedDependency = path.join(checkout, 'social-factory-api', 'node_modules', 'example', 'index.js');
  fs.writeFileSync(installedDependency, 'after npm ci\n');
  const receipt = { run_id: runId, status: 'success', commit_sha: 'abc123' };
  const sourceReport = path.join(checkout, reportPath);
  fs.writeFileSync(sourceReport, `${JSON.stringify(receipt, null, 2)}\n`);

  const originalStatus = git(['status', '--porcelain'], checkout);
  assert.match(originalStatus, /social-factory-api\/node_modules\/example\/index\.js/);

  const env = {
    ...process.env,
    REPORT_PATH: reportPath,
    GITHUB_RUN_ID: runId,
    RUNNER_TEMP: runnerTemp,
  };
  const script = path.join('scripts', path.basename(receiptScript));
  execFileSync('bash', [script], { cwd: checkout, env, encoding: 'utf8', stdio: 'pipe' });

  assert.equal(fs.readFileSync(installedDependency, 'utf8'), 'after npm ci\n');
  assert.equal(fs.readFileSync(sourceReport, 'utf8'), `${JSON.stringify(receipt, null, 2)}\n`);
  assert.equal(git(['status', '--porcelain'], checkout), originalStatus);

  const fetchRemoteMain = () => git(['fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main'], checkout);
  fetchRemoteMain();
  const firstRemoteHead = git(['rev-parse', 'origin/main'], checkout);
  const committedPaths = git(['show', '--pretty=format:', '--name-only', 'origin/main'], checkout).split(/\r?\n/).filter(Boolean);
  assert.deepEqual(committedPaths, [reportPath]);
  assert.deepEqual(JSON.parse(git(['show', `origin/main:${reportPath}`], checkout)), receipt);

  execFileSync('bash', [script], { cwd: checkout, env, encoding: 'utf8', stdio: 'pipe' });
  fetchRemoteMain();
  assert.equal(git(['rev-parse', 'origin/main'], checkout), firstRemoteHead);
  assert.equal(git(['status', '--porcelain'], checkout), originalStatus);
});
