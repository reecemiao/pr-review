import { Finding, ReviewDecision, ReviewResult, SubmitPayload } from '../types';

export type ToWebview =
    | { kind: 'init'; result: ReviewResult }
    | { kind: 'progress'; message: string }
    | { kind: 'submitResult'; ok: true; url: string }
    | { kind: 'submitResult'; ok: false; error: string };

export type FromWebview =
    | { kind: 'openFile'; file: string; line: number }
    | { kind: 'submit'; payload: SubmitPayload }
    | {
          kind: 'copyMarkdown';
          payload: { findings: Finding[]; decision: ReviewDecision; summary: string };
      };
