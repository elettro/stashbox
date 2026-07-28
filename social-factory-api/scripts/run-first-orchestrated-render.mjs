import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const apiBase = String(process.env.SOCIAL_API_BASE || '').replace(/\/+$/, '');
const secretId = String(
  process.env.SOCIAL_CONFIG_SECRET || 'stashbox/social-factory/dev/youtube-oauth/config'
).trim();
const reportPath = String(
  process.env.REPORT_PATH || 'deployment-reports/social-factory-first-orchestrated-render.json'
).trim();
const campaignName = 'First Orchestrated Render';
const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
const activeStatuses = new Set(['pending', 'preparing', 'rendering', 'uploading']);

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeCandidate(song) {
  if (!song) return null;
  return {
    song_key: String(song.song_key || ''),
    title: String(song.title || ''),
    artist: String(song.artist || ''),
    album_name: String(song.album_name || ''),
    genre: String(song.genre || ''),
    public_visibility: String(song.public_visibility || ''),
    visual_readiness: String(song.visual_readiness || ''),
    candidate_score: Number(song.candidate_score || 0),
    reasons: Array.isArray(song.reasons) ? song.reasons.map(String) : []
  };
}

function safeJob(job) {
  if (!job) return null;
  const outputs = Array.isArray(job.outputs) ? job.outputs : [];
  const firstOutput = outputs[0] || {};
  return {
    id: String(job.id || ''),
    batch_id: String(job.batch_id || ''),
    batch_name: String(job.batch_name || ''),
    campaign_name: String(job.campaign_name || ''),
    song_key: String(job.song_key || ''),
    song_title: String(job.song_title || ''),
    artist: String(job.artist || ''),
    status: String(job.status || ''),
    active: Boolean(job.active),
    ready_for_staging: Boolean(job.ready_for_staging),
    duration_mode: String(job.duration_mode || ''),
    duration_seconds: job.duration_seconds == null ? null : Number(job.duration_seconds),
    aspect_ratio: String(job.aspect_ratio || ''),
    width: Number(job.width || 0),
    height: Number(job.height || 0),
    fps: Number(job.fps || 0),
    output_filename: String(job.output_filename || ''),
    output_url: String(job.output_url || firstOutput.output_url || ''),
    thumbnail_url: String(job.thumbnail_url || firstOutput.thumbnail_url || ''),
    error_message: String(job.error_message || ''),
    created_at: String(job.created_at || ''),
    updated_at: String(job.updated_at || ''),
    started_at: String(job.started_at || ''),
    completed_at: String(job.completed_at || '')
  };
}

const report = {
  status: 'starting',
  recorded_at: nowIso(),
  source_commit: String(process.env.GITHUB_SHA || ''),
  social_api_base: apiBase,
  selection_mode: 'highest-ranked-visible-song-with-visuals',
  requested_render: {
    duration_mode: 'promo',
    duration_seconds: 30,
    aspect_ratio: '9:16',
    fps: 30
  },
  selected_song: null,
  reused_existing_job: false,
  draft_job: null,
  launch: null,
  final_job: null,
  youtube_published: false,
  error: ''
};

function saveReport() {
  report.recorded_at = nowIso();
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

function fail(message) {
  throw new Error(message);
}

function readSocialConfig() {
  const result = spawnSync(
    'aws',
    [
      'secretsmanager',
      'get-secret-value',
      '--secret-id',
      secretId,
      '--query',
      'SecretString',
      '--output',
      'text'
    ],
    {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      env: process.env
    }
  );

  if (result.status !== 0) {
    const message = String(result.stderr || 'AWS Secrets Manager read failed.').trim().slice(0, 500);
    fail(`Social Factory config read failed: ${message}`);
  }

  try {
    return JSON.parse(String(result.stdout || '').trim());
  } catch {
    fail('Social Factory config secret did not contain valid JSON.');
  }
}

async function request(adminToken, pathname, options = {}) {
  const response = await fetch(`${apiBase}${pathname}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'x-admin-token': adminToken,
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }

  return { ok: response.ok, status: response.status, body };
}

function selectCandidate(candidates) {
  return candidates.find((song) =>
    song?.eligible === true &&
    song?.public_visibility === 'visible' &&
    song?.visual_readiness === 'indicated'
  ) || candidates.find((song) =>
    song?.eligible === true && song?.public_visibility === 'visible'
  ) || candidates.find((song) => song?.eligible === true) || candidates[0] || null;
}

function responseError(label, result) {
  const downstream = result?.body?.details?.downstream_error;
  const direct = result?.body?.error || result?.body?.message;
  const message = String(downstream || direct || 'unknown_error').slice(0, 500);
  return `${label}: HTTP ${result?.status || 0} ${message}`;
}

async function main() {
  saveReport();

  if (!apiBase.startsWith('https://')) fail('SOCIAL_API_BASE must be an HTTPS URL.');

  const config = readSocialConfig();
  const adminToken = String(config.admin_token || '').trim();
  if (!adminToken) fail('Social Factory admin token is missing from the config secret.');

  report.status = 'reading_existing_jobs';
  saveReport();

  const jobsResult = await request(adminToken, '/social/orchestration/render-jobs?limit=100');
  if (!jobsResult.ok || jobsResult.body?.ok !== true) {
    fail(responseError('Render-job list failed', jobsResult));
  }

  const existingJobs = Array.isArray(jobsResult.body?.jobs) ? jobsResult.body.jobs : [];
  let job = existingJobs.find((item) =>
    item?.campaign_name === campaignName &&
    !['failed', 'cancelled', 'archived'].includes(String(item?.status || '').toLowerCase())
  ) || null;

  if (job) {
    report.reused_existing_job = true;
    report.draft_job = safeJob(job);
    report.selected_song = {
      song_key: String(job.song_key || ''),
      title: String(job.song_title || ''),
      artist: String(job.artist || '')
    };
    saveReport();
  } else {
    report.status = 'selecting_song';
    saveReport();

    const candidatesResult = await request(adminToken, '/social/orchestration/candidates?limit=25');
    if (!candidatesResult.ok || candidatesResult.body?.ok !== true) {
      fail(responseError('Candidate read failed', candidatesResult));
    }

    const candidates = Array.isArray(candidatesResult.body?.candidates)
      ? candidatesResult.body.candidates
      : [];
    const selected = selectCandidate(candidates);
    if (!selected?.song_key) fail('No eligible candidate song was returned.');

    report.selected_song = safeCandidate(selected);
    report.status = 'creating_render_draft';
    saveReport();

    const draftResult = await request(adminToken, '/social/orchestration/render-jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        song_key: selected.song_key,
        batch_name: `Social Factory First Orchestrated Render - ${selected.title || selected.song_key}`,
        client_name: 'Stashbox',
        project_name: 'Social Factory',
        campaign_name: campaignName,
        duration_mode: 'promo',
        duration_seconds: 30,
        aspect_ratio: '9:16',
        fps: 30,
        intro_enabled: true,
        outro_enabled: true,
        corner_bug_enabled: true,
        include_artist: true,
        include_song: true,
        include_album: true,
        metadata_comment: 'Selected and prepared by Stashbox Social Factory'
      })
    });

    if (!draftResult.ok || !draftResult.body?.job?.id) {
      fail(responseError('Render draft failed', draftResult));
    }

    job = draftResult.body.job;
    report.draft_job = safeJob(job);
    saveReport();
  }

  const jobId = String(job?.id || '').trim();
  if (!jobId) fail('The render job ID is missing.');

  let status = String(job.status || '').toLowerCase();

  if (status === 'draft') {
    report.status = 'launching_render';
    saveReport();

    const launchResult = await request(
      adminToken,
      `/social/orchestration/render-jobs/${encodeURIComponent(jobId)}/launch`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm_render: true })
      }
    );

    report.launch = {
      http_status: launchResult.status,
      launched: launchResult.body?.launched === true,
      job_id: jobId,
      downstream_success: launchResult.body?.downstream?.success === true,
      message: String(launchResult.body?.downstream?.message || ''),
      error: String(
        launchResult.body?.details?.downstream_error || launchResult.body?.error || ''
      )
    };
    saveReport();

    if (!launchResult.ok || launchResult.body?.launched !== true) {
      fail(responseError('Render launch failed', launchResult));
    }

    status = String(launchResult.body?.job?.status || 'pending').toLowerCase();
  }

  if (!activeStatuses.has(status) && !terminalStatuses.has(status)) {
    status = 'pending';
  }

  report.status = 'monitoring_render';
  saveReport();

  const deadline = Date.now() + 45 * 60 * 1000;
  let lastJob = job;

  while (Date.now() < deadline) {
    const jobResult = await request(
      adminToken,
      `/social/orchestration/render-jobs/${encodeURIComponent(jobId)}`
    );

    if (jobResult.ok && jobResult.body?.job) {
      lastJob = jobResult.body.job;
      status = String(lastJob.status || '').toLowerCase();
      report.final_job = safeJob(lastJob);
      saveReport();
      console.log(`Social Factory render status: ${status || 'unknown'}`);
      if (terminalStatuses.has(status)) break;
    }

    await sleep(15_000);
  }

  report.final_job = safeJob(lastJob);

  if (String(lastJob?.status || '').toLowerCase() !== 'completed') {
    fail(
      `Render ended with status ${String(lastJob?.status || 'unknown')}: ` +
      `${String(lastJob?.error_message || 'No error message returned.')}`
    );
  }

  report.status = 'success';
  saveReport();
}

try {
  await main();
} catch (error) {
  report.status = 'failure';
  report.error = String(error?.message || error || 'unknown_error').slice(0, 2000);
  saveReport();
  console.error(report.error);
  process.exitCode = 1;
}
