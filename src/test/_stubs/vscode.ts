// Minimal stub so unit tests can import modules that transitively `import * as vscode`.
// Tests that exercise vscode-dependent code paths should mock individual APIs they touch.
export const Uri = {
    joinPath: (..._args: unknown[]) => {
        throw new Error('vscode.Uri.joinPath not implemented in unit-test stub');
    },
};

export const workspace = {
    fs: {
        readFile: async () => {
            throw new Error('vscode.workspace.fs.readFile not implemented in unit-test stub');
        },
    },
    getConfiguration: () => ({
        get: <T>(_key: string, defaultValue?: T) => defaultValue,
    }),
};

export const window = {
    showInformationMessage: () => undefined,
    showErrorMessage: () => undefined,
};

export const env = {
    clipboard: { writeText: async () => undefined },
};

export const commands = {
    registerCommand: () => ({ dispose: () => undefined }),
    executeCommand: async () => undefined,
};

export class CancellationError extends Error {}

export const LanguageModelChatMessage = {
    User: (..._args: unknown[]) => ({}),
    Assistant: (..._args: unknown[]) => ({}),
};

export class LanguageModelTextPart {
    constructor(public value: string) {}
}

export class LanguageModelToolCallPart {
    constructor(
        public callId: string,
        public name: string,
        public input: unknown,
    ) {}
}

export class LanguageModelToolResultPart {
    constructor(
        public callId: string,
        public content: unknown[],
    ) {}
}

export class Position {
    constructor(
        public line: number,
        public character: number,
    ) {}
}

export class Range {
    constructor(
        public start: Position,
        public end: Position,
    ) {}
}

export const ViewColumn = { One: 1 } as const;
