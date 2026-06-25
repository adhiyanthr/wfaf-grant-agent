import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT } from '../wfaf-profile.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function searchGrants() {
  const today = new Date().toISOString().split('T')[0];

  console.log('Calling Claude with web search...');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 15,
      },
    ],
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Search thoroughly for all open grants that Wagner Farm Arboretum Foundation qualifies for. Cover federal, NJ state, and private foundation sources. Only include grants with future deadlines or upcoming open cycles. Return results as a raw JSON array only — no text, no markdown.`,
      },
    ],
  });

  // Log search count for cost visibility
  const searchBlocks = response.content.filter(
    (b) => b.type === 'tool_use' && b.name === 'web_search'
  );
  console.log(`Agent performed ${searchBlocks.length} web searches`);
  console.log(
    `Tokens used — input: ${response.usage.input_tokens}, output: ${response.usage.output_tokens}`
  );

  // Extract text content blocks
  const textBlocks = response.content.filter((b) => b.type === 'text');
  const fullText = textBlocks.map((b) => b.text).join('');

  if (!fullText.trim()) {
    throw new Error('Agent returned no text content');
  }

  // Parse JSON array from response
  // Claude may occasionally prefix with a sentence despite instructions — handle it
  const jsonMatch = fullText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Raw agent response:', fullText.slice(0, 500));
    throw new Error('No JSON array found in agent response');
  }

  let grants;
  try {
    grants = JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('JSON parse error. Raw match:', jsonMatch[0].slice(0, 500));
    throw new Error(`Failed to parse agent JSON: ${err.message}`);
  }

  if (!Array.isArray(grants)) {
    throw new Error('Agent response is not a JSON array');
  }

  // Validate and clean each grant
  const valid = grants.filter((g) => {
    if (!g.title || !g.url) {
      console.warn('Skipping grant missing title or url:', g);
      return false;
    }
    if (typeof g.fit_score !== 'number' || g.fit_score < 6) {
      return false;
    }
    return true;
  });

  console.log(`${valid.length} valid grants after filtering (${grants.length - valid.length} dropped)`);
  return valid;
}
