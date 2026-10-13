const { test } = require('node:test');
const assert = require('node:assert/strict');
const load = require('./load-typescript.cjs');

test('post-meeting notes use Gemini when OpenAI credits are exhausted', async () => {
  const originalFetch = global.fetch;
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalGemini = process.env.GEMINI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-openai';
  process.env.GEMINI_API_KEY = 'test-gemini';
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push(String(url));
    if (String(url).includes('openai.com')) return { ok: false, statusText: 'Too Many Requests', json: async () => ({ error: { message: 'credit_balance_exhausted' } }) };
    assert.match(options.body, /agenda by 6 PM/);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ summary: 'The agenda is due by 6 PM.', keyNotes: ['Agenda deadline'], keyDecisions: [], actionItems: [{ item: 'Send agenda', owner: 'Priya' }] }) }] } }] }) };
  };
  try {
    const { generateOpenAIMeetingNotes } = load('lib/openai-meeting-notes.ts');
    const notes = await generateOpenAIMeetingNotes([{ speaker: 'Priya', text: 'I will send the agenda by 6 PM.' }]);
    assert.equal(notes.summary, 'The agenda is due by 6 PM.');
    assert.equal(notes.actionItems[0].owner, 'Priya');
    assert.equal(calls.length, 2);
    assert.match(calls[1], /generativelanguage.googleapis.com/);
  } finally {
    global.fetch = originalFetch;
    if (originalOpenAI === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalOpenAI;
    if (originalGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = originalGemini;
  }
});
