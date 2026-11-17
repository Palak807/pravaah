import { env } from '../env.js';
import { scriptedProvider } from './scripted.js';
import { modelProvider } from './model.js';
import type { AssistantProvider } from './types.js';

/** Factory: pick the provider from env. 'model' needs ANTHROPIC_API_KEY. */
export function getAssistant(): AssistantProvider {
  if (env.assistantProvider === 'model') {
    if (!env.anthropicApiKey) {
      console.warn('[assistant] ASSISTANT_PROVIDER=model but ANTHROPIC_API_KEY is empty; using scripted.');
      return scriptedProvider;
    }
    console.log(`[assistant] using model provider (${env.anthropicModel}).`);
    return modelProvider;
  }
  return scriptedProvider;
}

export type { AssistantProvider } from './types.js';
