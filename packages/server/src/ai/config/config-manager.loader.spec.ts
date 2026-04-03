import * as fs from 'node:fs';
import * as path from 'node:path';
import type { JsonValue } from '../../common/types/json-value';
import { normalizeAiSettingsFile } from './config-manager.loader';

describe('normalizeAiSettingsFile', () => {
  it('keeps the bundled ai-settings example aligned with the current schema', () => {
    const examplePath = path.resolve(
      __dirname,
      '../../../../../config/ai-settings.example.json',
    );
    const example = JSON.parse(fs.readFileSync(examplePath, 'utf-8')) as JsonValue;

    const normalized = normalizeAiSettingsFile(
      example,
      3,
      new Date('2026-04-01T00:00:00.000Z'),
    );

    expect(normalized.changed).toBe(false);
    expect(normalized.settings.version).toBe(3);
    expect(normalized.settings.hostModelRouting).toEqual({
      fallbackChatModels: [],
      compressionModel: {
        providerId: 'openai',
        modelId: 'gpt-4o-mini',
      },
      utilityModelRoles: {
        conversationTitle: {
          providerId: 'openai',
          modelId: 'gpt-4o-mini',
        },
        pluginGenerateText: {
          providerId: 'team-gemini',
          modelId: 'gemini-2.0-flash',
        },
      },
    });
  });
});
