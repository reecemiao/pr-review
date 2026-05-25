// @ts-check
(function () {
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');

    /** @type {any} */
    let state = {
        result: null,
        selected: new Set(),
        decision: 'COMMENT',
        status: '',
        // Inflight (request sent, no response yet) and submitted (succeeded)
        // gate the Submit button so users can't accidentally post the same
        // review twice via double-click or after the success status is up.
        submitting: false,
        submitted: false,
    };

    function render() {
        if (!state.result) {
            root.textContent = 'Loading review…';
            return;
        }
        const r = state.result;
        const noPr = r.prNumber === null;

        root.innerHTML = '';

        const h1 = document.createElement('h1');
        h1.textContent = `Review: ${r.headBranch} → ${r.baseBranch}`;
        root.appendChild(h1);

        const meta = document.createElement('div');
        meta.className = 'meta';
        meta.textContent = noPr
            ? `${r.findings.length} findings · no open PR for this branch`
            : `${r.findings.length} findings · PR #${r.prNumber} on ${r.repo.owner}/${r.repo.name}`;
        root.appendChild(meta);

        const toolbar = document.createElement('div');
        toolbar.className = 'toolbar';

        const decisionLabel = document.createElement('label');
        decisionLabel.textContent = 'Decision: ';
        const decisionSelect = document.createElement('select');
        for (const v of ['APPROVE', 'COMMENT', 'REQUEST_CHANGES']) {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            if (v === state.decision) opt.selected = true;
            decisionSelect.appendChild(opt);
        }
        decisionSelect.addEventListener('change', () => {
            state.decision = decisionSelect.value;
            // Re-render so the submit button's enabled state reflects the
            // new decision (APPROVE allows empty-selection submit).
            render();
        });
        decisionLabel.appendChild(decisionSelect);
        toolbar.appendChild(decisionLabel);

        const submitBtn = document.createElement('button');
        submitBtn.textContent = state.submitted
            ? 'Submitted'
            : noPr
              ? 'Submit (no open PR)'
              : 'Submit to GitHub';
        // APPROVE with zero selected is a valid clean approval (especially
        // when the agent returns no findings). For COMMENT / REQUEST_CHANGES
        // require at least one comment so the review isn't empty.
        const emptyAndNotApproving = state.selected.size === 0 && state.decision !== 'APPROVE';
        submitBtn.disabled = noPr || state.submitting || state.submitted || emptyAndNotApproving;
        if (noPr) submitBtn.title = `Push the branch and open a PR to enable submission.`;
        else if (state.submitted)
            submitBtn.title = 'Review already submitted. Close and re-run to submit again.';
        else if (emptyAndNotApproving)
            submitBtn.title = 'Select at least one finding, or switch the decision to APPROVE.';
        submitBtn.addEventListener('click', () => {
            if (state.submitting || state.submitted) return;
            state.submitting = true;
            state.status = 'Submitting…';
            vscode.postMessage({
                kind: 'submit',
                payload: {
                    selectedIds: [...state.selected],
                    finalDecision: state.decision,
                },
            });
            render();
        });
        toolbar.appendChild(submitBtn);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'secondary';
        copyBtn.textContent = 'Copy as markdown';
        copyBtn.addEventListener('click', () => {
            const selectedFindings = r.findings.filter((f) => state.selected.has(f.id));
            vscode.postMessage({
                kind: 'copyMarkdown',
                payload: {
                    findings: selectedFindings,
                    decision: state.decision,
                    summary: r.summary,
                },
            });
        });
        toolbar.appendChild(copyBtn);

        const status = document.createElement('span');
        status.className = 'status';
        status.textContent = state.status;
        toolbar.appendChild(status);

        root.appendChild(toolbar);

        if (r.summary) {
            const sum = document.createElement('div');
            sum.className = 'summary';
            sum.textContent = r.summary;
            root.appendChild(sum);
        }

        if (r.findings.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = 'No findings.';
            root.appendChild(empty);
            return;
        }

        for (const f of r.findings) {
            const card = document.createElement('div');
            card.className = 'finding';

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = state.selected.has(f.id);
            cb.addEventListener('change', () => {
                if (cb.checked) state.selected.add(f.id);
                else state.selected.delete(f.id);
                render();
            });
            card.appendChild(cb);

            const body = document.createElement('div');
            body.className = 'finding-body';

            const header = document.createElement('div');
            header.className = 'finding-header';

            const sev = document.createElement('span');
            sev.className = `severity ${f.severity}`;
            sev.textContent = f.severity;
            header.appendChild(sev);

            const title = document.createElement('span');
            title.className = 'title';
            title.textContent = f.title;
            header.appendChild(title);

            const loc = document.createElement('span');
            loc.className = 'location';
            const link = document.createElement('a');
            link.textContent = `${f.file}:${f.line}`;
            link.addEventListener('click', () => {
                vscode.postMessage({ kind: 'openFile', file: f.file, line: f.line });
            });
            loc.appendChild(link);
            header.appendChild(loc);

            body.appendChild(header);

            const bodyText = document.createElement('div');
            bodyText.textContent = f.body;
            body.appendChild(bodyText);

            if (f.suggestedFix) {
                const pre = document.createElement('pre');
                pre.textContent = f.suggestedFix;
                body.appendChild(pre);
            }

            card.appendChild(body);
            root.appendChild(card);
        }
    }

    window.addEventListener('message', (e) => {
        const msg = e.data;
        if (msg.kind === 'init') {
            state.result = msg.result;
            state.decision = msg.result.proposedDecision;
            state.selected = new Set(msg.result.findings.map((f) => f.id));
            state.status = '';
            render();
        } else if (msg.kind === 'progress') {
            state.status = msg.message;
            render();
        } else if (msg.kind === 'submitResult') {
            state.submitting = false;
            // Success is terminal — keep the button disabled so the same
            // review can't be posted twice. On failure leave `submitted`
            // false so the user can retry after fixing whatever broke.
            state.submitted = !!msg.ok;
            state.status = msg.ok ? `Submitted: ${msg.url}` : `Failed: ${msg.error}`;
            render();
        }
    });

    render();
})();
