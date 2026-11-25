import { GoogleGenAI, Type } from '@google/genai';
import type {
  AcceptanceCriterion,
  ChangedFile,
  MissingInfoFlag,
  ReviewFinding,
} from '../types/calder';

const GEMINI_MODEL = 'gemini-4-hydrogen';

function getServerGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Configure it in Settings > Secrets, or continue using the Demo workspace.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function draftCriteriaWithGemini(params: {
  requestText: string;
  projectName: string;
  repository: string;
  stackSummary: string;
}): Promise<{
  criteria: AcceptanceCriterion[];
  flags: MissingInfoFlag[];
  model: string;
}> {
  const ai = getServerGeminiClient();
  const prompt = [
    `Project: ${params.projectName} (${params.repository})`,
    `Stack: ${params.stackSummary}`,
    `Feature request: ${params.requestText}`,
    '',
    'Write 4 to 6 concrete, testable acceptance criteria covering backend API contracts, validation/error handling, frontend UI behavior, and automated tests.',
    'Also identify up to 2 ambiguous or missing details as clarification questions with sensible default resolutions.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction:
        'You are the Requirements Analyst agent inside Calder Works. Produce concise, engineering-grade acceptance criteria without marketing fluff.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          criteria: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                category: {
                  type: Type.STRING,
                  description: 'One of functional, validation, ui, testing',
                },
              },
              required: ['text', 'category'],
            },
          },
          flags: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                severity: {
                  type: Type.STRING,
                  description: 'One of clarification or blocking',
                },
                resolution: { type: Type.STRING },
              },
              required: ['question', 'severity'],
            },
          },
        },
        required: ['criteria', 'flags'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as {
    criteria?: Array<{ text: string; category?: string }>;
    flags?: Array<{ question: string; severity?: string; resolution?: string }>;
  };

  const allowedCategories = new Set(['functional', 'validation', 'ui', 'testing']);

  const criteria: AcceptanceCriterion[] = (parsed.criteria ?? []).map((item, idx) => ({
    id: `ac-gem-${Date.now()}-${idx + 1}`,
    text: String(item.text || '').trim(),
    category: allowedCategories.has(item.category || '')
      ? (item.category as AcceptanceCriterion['category'])
      : 'functional',
    verified: false,
  }));

  const flags: MissingInfoFlag[] = (parsed.flags ?? []).map((item, idx) => ({
    id: `flag-gem-${Date.now()}-${idx + 1}`,
    question: String(item.question || '').trim(),
    severity: item.severity === 'blocking' ? 'blocking' : 'clarification',
    resolution: item.resolution ? String(item.resolution).trim() : undefined,
  }));

  return { criteria, flags, model: GEMINI_MODEL };
}

export async function reviewDiffWithGemini(params: {
  requestText: string;
  criteria: AcceptanceCriterion[];
  changedFiles: ChangedFile[];
}): Promise<{ findings: ReviewFinding[]; model: string }> {
  const ai = getServerGeminiClient();
  const diffBundle = params.changedFiles
    .slice(0, 6)
    .map((f) => `FILE: ${f.path}\n${f.diff.slice(0, 2200)}`)
    .join('\n\n');

  const prompt = [
    `Request: ${params.requestText}`,
    'Acceptance criteria:',
    ...params.criteria.map((c, idx) => `${idx + 1}. ${c.text}`),
    '',
    'Combined diff:',
    diffBundle,
    '',
    'Return 1 to 3 focused code review findings tied to exact file paths and line numbers.',
  ].join('\n');

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction:
        'You are the Code Reviewer agent inside Calder Works. Check diffs strictly against acceptance criteria, security, and edge cases.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          findings: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                filePath: { type: Type.STRING },
                line: { type: Type.INTEGER },
                severity: {
                  type: Type.STRING,
                  description: 'One of blocker, suggestion, note',
                },
                message: { type: Type.STRING },
              },
              required: ['filePath', 'line', 'severity', 'message'],
            },
          },
        },
        required: ['findings'],
      },
    },
  });

  const rawText = (response.text ?? '{}').trim();
  const parsed = JSON.parse(rawText) as {
    findings?: Array<{
      filePath: string;
      line: number;
      severity: string;
      message: string;
    }>;
  };

  const allowedSeverities = new Set(['blocker', 'suggestion', 'note']);
  const findings: ReviewFinding[] = (parsed.findings ?? []).map((item, idx) => ({
    id: `rf-gem-${Date.now()}-${idx + 1}`,
    filePath: String(item.filePath || params.changedFiles[0]?.path || 'unknown'),
    line: Number.isFinite(item.line) && item.line > 0 ? Math.floor(item.line) : 1,
    severity: allowedSeverities.has(item.severity)
      ? (item.severity as ReviewFinding['severity'])
      : 'suggestion',
    author: `Code reviewer agent (${GEMINI_MODEL})`,
    message: String(item.message || '').trim(),
    resolved: false,
  }));

  return { findings, model: GEMINI_MODEL };
}
