'use strict';

const axios = require('axios');

/**
 * Query WolframAlpha Short Answers API.
 * Returns { ok, result, source } or { ok: false, error }
 */
async function queryWolfram(question) {
  const appId = process.env.WOLFRAM_APP_ID?.trim();
  if (!appId) return { ok: false, error: 'WOLFRAM_APP_ID not set in .env' };

  try {
    // Short answers API — simplest, returns plain text
    const res = await axios.get('https://api.wolframalpha.com/v1/result', {
      params: { appid: appId, i: question, timeout: 10 },
      timeout: 15000,
    });

    const result = res.data?.trim();
    if (!result || result === 'Wolfram|Alpha did not understand your input') {
      return { ok: false, error: 'WolframAlpha could not understand the question' };
    }

    console.log('✅ WolframAlpha:', result);
    return { ok: true, result, source: 'WolframAlpha' };
  } catch (e) {
    const msg = e.response?.data || e.message;
    console.log('❌ WolframAlpha error:', msg);
    return { ok: false, error: String(msg) };
  }
}

/**
 * Query WolframAlpha Full Results API — more detailed, returns steps.
 * Returns { ok, result, steps, source } or { ok: false, error }
 */
async function queryWolframFull(question) {
  const appId = process.env.WOLFRAM_APP_ID?.trim();
  if (!appId) return { ok: false, error: 'WOLFRAM_APP_ID not set in .env' };

  try {
    const res = await axios.get('https://api.wolframalpha.com/v2/query', {
      params: {
        appid: appId,
        input: question,
        output: 'JSON',
        format: 'plaintext',
        podstate: 'Step-by-step solution',
        timeout: 15,
      },
      timeout: 20000,
    });

    const data = res.data?.queryresult;
    if (!data?.success) {
      return { ok: false, error: 'WolframAlpha returned no results' };
    }

    const pods = data.pods || [];
    let result = null;
    let steps = null;

    // Extract result from pods
    for (const pod of pods) {
      const title = (pod.title || '').toLowerCase();
      if (
        title.includes('result') ||
        title.includes('indefinite integral') ||
        title.includes('definite integral') ||
        title.includes('derivative') ||
        title.includes('solution') ||
        title.includes('value')
      ) {
        const text = pod.subpods?.[0]?.plaintext;
        if (text) { result = text; break; }
      }
    }

    // Extract step-by-step if available
    for (const pod of pods) {
      const title = (pod.title || '').toLowerCase();
      if (title.includes('step')) {
        const text = pod.subpods?.map(s => s.plaintext).filter(Boolean).join('\n');
        if (text) { steps = text; break; }
      }
    }

    if (!result) {
      // Fallback: take first non-empty pod
      for (const pod of pods) {
        const text = pod.subpods?.[0]?.plaintext;
        if (text) { result = text; break; }
      }
    }

    if (!result) return { ok: false, error: 'No result found in WolframAlpha response' };

    console.log('✅ WolframAlpha full result:', result);
    return { ok: true, result, steps, source: 'WolframAlpha' };
  } catch (e) {
    console.log('❌ WolframAlpha full error:', e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * Format a math question for WolframAlpha.
 * Converts natural language to WolframAlpha-friendly syntax.
 */
function formatForWolfram(question) {
  let q = question.trim();

  // Natural language → WolframAlpha syntax
  q = q.replace(/\bintegrate\b/gi, 'integrate');
  q = q.replace(/\bintegral of\b/gi, 'integrate');
  q = q.replace(/\bdifferentiate\b/gi, 'differentiate');
  q = q.replace(/\bderivative of\b/gi, 'differentiate');
  q = q.replace(/\blimit\s+(\S+)\s+to\s+(\S+)/gi, 'limit $1 to $2');
  q = q.replace(/\bfrom\s+(\S+)\s+to\s+(\S+)/gi, 'from $1 to $2');
  q = q.replace(/\bsqrt\s*\(/gi, 'sqrt(');
  q = q.replace(/\broot\s*\(/gi, 'sqrt(');
  q = q.replace(/\bln\s*\(/gi, 'ln(');
  q = q.replace(/\blog\s*\(/gi, 'log(');
  q = q.replace(/π/g, 'pi');
  q = q.replace(/∞/g, 'infinity');
  q = q.replace(/∫/g, 'integrate');

  return q;
}

function hasWolframKey() {
  return Boolean(process.env.WOLFRAM_APP_ID?.trim());
}

module.exports = { queryWolfram, queryWolframFull, formatForWolfram, hasWolframKey };