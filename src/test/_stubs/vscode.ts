// Minimal stub so unit tests can import modules that transitively `import * as vscode`.
// Tests that exercise vscode-dependent code paths should mock individual APIs they touch.
export const Uri = {
    file: (p: string) => ({ fsPath: p, scheme: 'file', path: p }),
    // Forward-slash-only join so tests can assert deterministic paths across
    // platforms. VS Code's real Uri.joinPath also normalizes to forward
    // slashes for the URI `path`; we mirror that for `fsPath` too so tests
    // don't have to special-case Windows separators.
    joinPath: (base: { fsPath: string }, ...segments: string[]) => {
        const joined = [base.fsPath.replace(/\/$/, ''), ...segments].join('/');
        return { fsPath: joined, scheme: 'file', path: joined };
    },
};

export const FileType = { File: 1, Directory: 2, SymbolicLink: 64 } as const;

export const workspace = {
    fs: {
        // Reassigned per-test via vi.spyOn / direct assignment when a test
        // exercises a code path that hits the FS. Default throws so tests
        // that touch the FS without setting up a mock get a loud failure.
        readFile: async (_uri: unknown): Promise<Uint8Array> => {
            throw new Error('vscode.workspace.fs.readFile not implemented in unit-test stub');
        },
        readDirectory: async (_uri: unknown): Promise<Array<[string, number]>> => {
            throw new Error('vscode.workspace.fs.readDirectory not implemented in unit-test stub');
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
    User: (content: unknown) => ({ role: 'user' as const, content }),
    Assistant: (content: unknown) => ({ role: 'assistant' as const, content }),
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
