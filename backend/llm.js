const axios = require('axios');

/** Current OpenRouter free models (updated 2026 — old :free R1 slugs were removed). */
const DEFAULT_OPENROUTER_MODELS = [
  'deepseek/deepseek-v4-flash:free',
  'qwen/qwen3-coder:free',
  'openai/gpt-oss-120b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'openrouter/free',
];

const VISION_MODELS = [
  'qwen/qwen2.5-vl-72b-instruct:free',         // best vision model, free
  'meta-llama/llama-3.2-11b-vision-instruct:free', // Meta vision fallback
];

function getOpenRouterModels() {
  const fromEnv = process.env.OPENROUTER_MODELS?.trim();
  if (fromEnv) {
    return fromEnv.split(',').map((m) => m.trim()).filter(Boolean);
  }
  return DEFAULT_OPENROUTER_MODELS;
}

function stripThinking(text) {
  if (!text) return '';
  let out = text
    .replace(/^[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, '')
    .trim();
  // Fix unmatched \left / \right that break MathJax
  out = out
    .replace(/\\left\s*\(/g, '(')
    .replace(/\\right\s*\)/g, ')')
    .replace(/\\left\s*\[/g, '[')
    .replace(/\\right\s*\]/g, ']')
    .replace(/\\left\s*/g, '')
    .replace(/\\right\s*/g, '');
  return out;
}

function formatApiError(err, provider = 'API') {
  const status = err.response?.status;
  const apiMsg =
    err.response?.data?.error?.message ||
    err.response?.data?.message ||
    err.message;

  if (status === 402) {
    return (
      `${provider}: Payment required (no credits / balance). ` +
      'Add credits at https://platform.deepseek.com/ or https://openrouter.ai/settings/credits. ' +
      'Calculus still works via SymPy without credits.'
    );
  }
  if (status === 401) {
    return `${provider}: Invalid API key. Check your .env file and restart the server.`;
  }
  if (status === 429) {
    return `${provider}: Rate limit — wait a minute and try again.`;
  }
  return `${provider}: ${apiMsg}`;
}

function isPaymentError(err) {
  return err.response?.status === 402;
}

function shouldTryNextModel(err) {
  const msg = (
    err.response?.data?.error?.message ||
    err.response?.data?.message ||
    err.message ||
    ''
  ).toLowerCase();
  return (
    err.response?.status === 404 ||
    err.response?.status === 429 ||
    msg.includes('no endpoints') ||
    msg.includes('not found') ||
    msg.includes('does not exist') ||
    msg.includes('invalid model')
  );
}

async function callDeepSeekDirect({ messages, model, maxTokens, temperature }) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    const e = new Error('DEEPSEEK_API_KEY is missing in backend/.env');
    e.code = 'NO_KEY';
    throw e;
  }

  const response = await axios.post(
    'https://api.deepseek.com/chat/completions',
    {
      model: model || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      messages,
      max_tokens: maxTokens,
      temperature,
    },
    {
      timeout: 180000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('No content in DeepSeek response');
  return { text: stripThinking(text), provider: 'DeepSeek' };
}

async function callOpenRouter({ messages, model, maxTokens, temperature }) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) {
    const e = new Error('OPENROUTER_API_KEY is missing in backend/.env');
    e.code = 'NO_KEY';
    throw e;
  }

  const preferred = model || process.env.OPENROUTER_MODEL?.trim();
  const modelsToTry = [
    ...new Set([...(preferred ? [preferred] : []), ...getOpenRouterModels()]),
  ];
  const errors = [];

  for (const modelName of modelsToTry) {
    try {
      console.log(`OpenRouter trying: ${modelName}`);
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: modelName,
          messages,
          max_tokens: maxTokens,
          temperature,
        },
        {
          timeout: 180000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'MathAI',
          },
        }
      );

      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('No content in OpenRouter response');
      console.log(`OpenRouter OK: ${modelName}`);
      return {
        text: stripThinking(text),
        provider: `OpenRouter (${modelName})`,
      };
    } catch (e) {
      const errLine = `${modelName}: ${formatApiError(e, 'OpenRouter')}`;
      errors.push(errLine);
      console.log(`OpenRouter fail: ${errLine}`);

      if (!shouldTryNextModel(e)) {
        throw new Error(errors.join(' | '));
      }
      if (e.response?.status === 429) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  throw new Error(
    errors.length
      ? errors.join(' | ')
      : 'All OpenRouter models failed. Set OPENROUTER_MODELS in .env or add credits.'
  );
}

/**
 * Chat completion: DeepSeek direct first, then OpenRouter on 402 / missing key.
 */
async function chatCompletion(opts) {
  const {
    messages,
    model,
    maxTokens = 10000,
    temperature = 0.1,
    openRouterModel,
  } = opts;

  const prefer = (process.env.AI_PROVIDER || 'deepseek').toLowerCase();

  async function tryDeepSeek() {
    return callDeepSeekDirect({ messages, model, maxTokens, temperature });
  }

  async function tryOpenRouter() {
    return callOpenRouter({
      messages,
      model: openRouterModel,
      maxTokens,
      temperature,
    });
  }

  if (prefer === 'openrouter') {
    try {
      return await tryOpenRouter();
    } catch (e) {
      if (process.env.DEEPSEEK_API_KEY?.trim()) return tryDeepSeek();
      throw e;
    }
  }

  try {
    return await tryDeepSeek();
  } catch (e) {
    if (
      process.env.OPENROUTER_API_KEY?.trim() &&
      (isPaymentError(e) || e.code === 'NO_KEY' || e.response?.status === 401)
    ) {
      console.log('DeepSeek unavailable, falling back to OpenRouter...');
      return tryOpenRouter();
    }
    const wrapped = new Error(formatApiError(e, 'DeepSeek'));
    wrapped.status = e.response?.status;
    wrapped.isPaymentError = isPaymentError(e);
    wrapped.cause = e;
    throw wrapped;
  }
}

function hasAnyLlmKey() {
  return Boolean(
    process.env.DEEPSEEK_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim()
  );
}


// ─── STREAMING ────────────────────────────────────────────────────────────────

async function streamOpenRouter({ messages, modelName, maxTokens = 10000, temperature = 0.1, onChunk }) {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY missing');

  const response = await axios.post(
    'https://openrouter.ai/api/v1/chat/completions',
    { model: modelName, messages, max_tokens: maxTokens, temperature, stream: true },
    {
      timeout: 180000, responseType: 'stream',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'MathAI',
      },
    }
  );

  let fullText = '', buffer = '', inThink = false;
  await new Promise((resolve, reject) => {
    response.data.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue;
        try {
          const delta = JSON.parse(t.slice(6)).choices?.[0]?.delta?.content || '';
          if (!delta) continue;
          let out = delta;
          if (inThink) { const ei = out.indexOf('</think>'); if (ei !== -1) { out = out.slice(ei+8); inThink = false; } else out = ''; }
          const si = out.indexOf('<think>');
          if (si !== -1) { const ei = out.indexOf('</think>', si); if (ei !== -1) out = out.slice(0,si)+out.slice(ei+8); else { out = out.slice(0,si); inThink = true; } }
          if (out) { fullText += out; if (onChunk) onChunk(out); }
        } catch {}
      }
    });
    response.data.on('end', resolve);
    response.data.on('error', reject);
  });
  return { text: fullText.trim(), provider: `OpenRouter (${modelName})` };
}

async function streamDeepSeekDirect({ messages, maxTokens = 10000, temperature = 0.1, onChunk }) {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');

  const response = await axios.post(
    'https://api.deepseek.com/chat/completions',
    { model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', messages, max_tokens: maxTokens, temperature, stream: true },
    { timeout: 180000, responseType: 'stream', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` } }
  );

  let fullText = '', buffer = '', inThink = false;
  await new Promise((resolve, reject) => {
    response.data.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        const t = line.trim();
        if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue;
        try {
          const delta = JSON.parse(t.slice(6)).choices?.[0]?.delta?.content || '';
          if (!delta) continue;
          let out = delta;
          if (inThink) { const ei = out.indexOf('</think>'); if (ei !== -1) { out = out.slice(ei+8); inThink = false; } else out = ''; }
          const si = out.indexOf('<think>');
          if (si !== -1) { const ei = out.indexOf('</think>', si); if (ei !== -1) out = out.slice(0,si)+out.slice(ei+8); else { out = out.slice(0,si); inThink = true; } }
          if (out) { fullText += out; if (onChunk) onChunk(out); }
        } catch {}
      }
    });
    response.data.on('end', resolve);
    response.data.on('error', reject);
  });
  return { text: fullText.trim(), provider: 'DeepSeek' };
}

/**
 * SEQUENTIAL MODE: Try providers one by one until one succeeds.
 * Fixes the "AI bubble appears but stays empty" bug caused by the
 * old race mode where losing racers sent chunks to a dead stream.
 */
async function streamCompletion({ messages, maxTokens = 10000, temperature = 0.1, onChunk, preferVision = false }) {
  const hasDeepSeek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY?.trim());

  if (!hasDeepSeek && !hasOpenRouter) throw new Error('No API keys configured');

  const errors = [];

  // For vision requests, skip DeepSeek (no vision) and use vision-capable OpenRouter models
  if (preferVision && hasOpenRouter) {
    console.log('👁️ Vision mode: trying vision models...');
    for (const modelName of VISION_MODELS) {
      try {
        console.log(`Vision trying: ${modelName}`);
        const result = await streamOpenRouter({ messages, modelName, maxTokens, temperature, onChunk });
        console.log(`Vision OK: ${modelName}`);
        return result;
      } catch (e) {
        const errMsg = formatApiError(e, 'OpenRouter');
        errors.push(`${modelName}: ${errMsg}`);
        console.log(`Vision fail: ${modelName}: ${errMsg}`);
        if (e.response?.status === 429) await new Promise(r => setTimeout(r, 1500));
        if (e.response?.status === 401) break;
      }
    }
    // fallback to normal models if all vision models fail
    console.log('Vision models failed, falling back to text models...');
  }

  // 1. Try DeepSeek first (text only)
  if (hasDeepSeek) {
    try {
      console.log('Trying DeepSeek...');
      return await streamDeepSeekDirect({ messages, maxTokens, temperature, onChunk });
    } catch (e) {
      console.log(`❌ DeepSeek failed: ${e.message}`);
      errors.push(`DeepSeek: ${e.message}`);
      if (!hasOpenRouter) throw new Error(errors.join(' | '));
      console.log('DeepSeek unavailable, falling back to OpenRouter...');
    }
  }

  // 2. Try OpenRouter models sequentially
  if (hasOpenRouter) {
    for (const modelName of getOpenRouterModels()) {
      try {
        console.log(`OpenRouter trying: ${modelName}`);
        const result = await streamOpenRouter({ messages, modelName, maxTokens, temperature, onChunk });
        console.log(`OpenRouter OK: ${modelName}`);
        return result;
      } catch (e) {
        const errMsg = formatApiError(e, 'OpenRouter');
        errors.push(`${modelName}: ${errMsg}`);
        console.log(`OpenRouter fail: ${modelName}: ${errMsg}`);
        if (e.response?.status === 429) await new Promise(r => setTimeout(r, 1500));
        if (e.response?.status === 401) break; // wrong key, no point continuing
      }
    }
  }

  throw new Error('All providers failed: ' + errors.join(' | '));
}

module.exports = {
  chatCompletion,
  formatApiError,
  isPaymentError,
  hasAnyLlmKey,
  stripThinking,
  getOpenRouterModels,
  streamCompletion,
};