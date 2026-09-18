#!/usr/bin/env node
//
// Extract a HAR from a Playwright trace.
//
// Why this exists, and why it is an extraction rather than a recording: a trace already carries
// the full network log. Inside the zip it is a `.network` file whose every line is one request
// with `request`, `response` and `timings` — the shape of a HAR entry. Turning on
// `recordHar` in the config would write that same data a second time, so this reads it out of
// what the run already produced. Cost of the extraction: no recording overhead at all.
//
// What it buys over the trace itself: a HAR opens in any browser's network panel (DevTools →
// Network → Import HAR) with no checkout and no `npx`. The trace is richer, but reading one
// needs the repository, which puts an engineer between a non-engineer and the bug.
//
// Its value is narrow, and worth saying plainly: a HAR shows a network-shaped failure — a
// request that 404s, a resource that never loads, a payload that is wrong. It shows nothing
// about a sorting bug. It sits beside the trace, it does not replace it.
//
// CREDENTIALS: cookie, set-cookie and authorization header VALUES are replaced with
// `<redacted by trace-to-har>`; the names are kept, so "a session cookie was sent" survives and
// the token does not. A trace inherits the confidentiality of the application under test, and a
// HAR is plainer to read than a trace — it is JSON anybody can open. Response BODIES are copied
// verbatim for text responses, so a HAR from an application with real data holds real data.
//
// Usage:  trace-to-har.mjs <trace.zip> [out.har]
// Exit:   0   written — the path and entry count are printed
//         1   the trace could not be read, or holds no network log
//
// Plain Node, no dependencies, mirroring the other scripts in this skill.

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const REDACTED = '<redacted by trace-to-har>';
const SECRET_HEADERS = new Set(['cookie', 'set-cookie', 'authorization', 'proxy-authorization']);

/**
 * Minimal reader for the entries we need out of a trace zip.
 *
 * Node ships no zip reader and this skill takes no dependencies, so this walks the central
 * directory itself. Trace zips are single-disk, uncommented, and either stored or deflated,
 * which is the whole of what this handles — it is not a general-purpose unzip.
 */
function readZip(file) {
  const buf = readFileSync(file);
  let eocd = -1;
  // The end-of-central-directory record sits at the tail, after a comment of up to 64 KiB.
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65558; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a zip file: no end-of-central-directory record');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip: bad directory entry');
    const nameLen = buf.readUInt16LE(p + 28);
    entries.set(buf.subarray(p + 46, p + 46 + nameLen).toString('utf-8'), {
      method: buf.readUInt16LE(p + 10),
      compressedSize: buf.readUInt32LE(p + 20),
      localOffset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLen + extraAndComment(buf, p);
  }

  return {
    names: () => [...entries.keys()],
    read(name) {
      const e = entries.get(name);
      if (!e) return undefined;
      // The local header repeats the name and extra fields, and their lengths can differ from
      // the central directory's copy — so read the local ones, never reuse the central ones.
      const start =
        e.localOffset + 30 + buf.readUInt16LE(e.localOffset + 26) + buf.readUInt16LE(e.localOffset + 28);
      const raw = buf.subarray(start, start + e.compressedSize);
      return e.method === 0 ? raw : inflateRawSync(raw);
    },
  };
}

const extraAndComment = (buf, p) => buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);

/** Text responses get their body inlined; binary ones get their size and nothing else. */
const isText = (mime = '') =>
  /^text\//i.test(mime) || /^application\/(json|javascript|xml|xhtml|x-www-form-urlencoded)/i.test(mime) || /\+json/i.test(mime);

const redactHeaders = (headers = []) =>
  headers.map((h) => (SECRET_HEADERS.has(h.name?.toLowerCase()) ? { ...h, value: REDACTED } : h));

const redactCookies = (cookies = []) => cookies.map((c) => ({ ...c, value: REDACTED }));

export function traceToHar(tracePath) {
  const zip = readZip(tracePath);
  const netFile = zip.names().find((n) => n.endsWith('.network'));
  if (!netFile) throw new Error(`no network log inside ${tracePath}`);

  const entries = [];
  const pages = new Map();

  for (const line of zip.read(netFile).toString('utf-8').split('\n')) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // a truncated trailing line in an interrupted run — skip it, keep the rest
    }
    if (parsed.type !== 'resource-snapshot' || !parsed.snapshot) continue;

    const e = parsed.snapshot;
    const content = { ...(e.response?.content ?? {}) };
    const sha1 = content._sha1;
    delete content._sha1;

    if (sha1) {
      const body = zip.read(`resources/${sha1}`);
      if (body && isText(content.mimeType)) content.text = body.toString('utf-8');
      else if (body) content.comment = `binary body omitted by trace-to-har (${body.length} bytes)`;
    }

    if (e.pageref && !pages.has(e.pageref)) {
      pages.set(e.pageref, {
        id: e.pageref,
        startedDateTime: e.startedDateTime,
        title: e.request?.url ?? e.pageref,
        pageTimings: {},
      });
    }

    entries.push({
      pageref: e.pageref,
      startedDateTime: e.startedDateTime,
      time: e.time,
      request: {
        ...e.request,
        cookies: redactCookies(e.request?.cookies),
        headers: redactHeaders(e.request?.headers),
      },
      response: {
        ...e.response,
        cookies: redactCookies(e.response?.cookies),
        headers: redactHeaders(e.response?.headers),
        content,
      },
      cache: {},
      timings: e.timings ?? {},
      serverIPAddress: e.serverIPAddress,
      connection: e._serverPort !== undefined ? String(e._serverPort) : undefined,
    });
  }

  return {
    log: {
      version: '1.2',
      creator: { name: 'trace-to-har (report-bug skill)', version: '1', comment: `extracted from ${tracePath}` },
      pages: [...pages.values()],
      entries,
      comment:
        'Extracted from a Playwright trace, not recorded separately. Credential header and ' +
        'cookie values are redacted; text response bodies are verbatim.',
    },
  };
}

// Standalone use. When imported, `import.meta.main` is false and nothing below runs.
if (import.meta.main) {
  const [tracePath, outPath] = process.argv.slice(2);
  if (!tracePath) {
    console.error('usage: trace-to-har.mjs <trace.zip> [out.har]');
    process.exit(1);
  }
  try {
    const har = traceToHar(tracePath);
    const out = outPath ?? tracePath.replace(/\.zip$/, '') + '.har';
    writeFileSync(out, JSON.stringify(har, null, 2), 'utf-8');
    console.log(`${out}  (${har.log.entries.length} requests)`);
  } catch (error) {
    console.error(`trace-to-har: ${error.message}`);
    process.exit(1);
  }
}
