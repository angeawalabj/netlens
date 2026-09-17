# Contributing to NetLens

Thank you for your interest. This document tells you exactly
what to do to contribute, whatever your background.

---

## Before You Start

**Read the architecture document first.**
`docs/architecture.md` explains why the code is structured
the way it is. A contribution that violates these principles
will not be merged — not because it is wrong, but because
consistency matters more than any individual change.

---

## Types of Contributions

### Fix a bug

1. Open an issue describing the bug (what you expected,
   what happened, how to reproduce)
2. Wait for confirmation before spending time on a fix
3. Reference the issue in your PR

### Improve an explanation

The most valuable contributions are often the simplest.
If an explanation in the sandbox or curriculum is confusing,
misleading, or could be clearer — open a PR.

Files to edit:
- Curriculum chapters → `curriculum/fr/*.md`
- Sandbox explanations → `packages/core/src/protocols/*.js`
  (the `explanation` field of each step)
- Quiz explanations → `packages/core/src/quiz/questions.js`
  (the `e` and `c` fields)

No setup required — edit the file directly on GitHub.

### Add a quiz question

Edit `packages/core/src/quiz/questions.js`.

Each question follows this structure:

```js
{
  id:      91,         // Next available integer — never reuse
  type:    3,          // 1=Recall 2=Analysis 3=Troubleshoot 4=Packets 5=Decisions
  week:    2,          // Which week of the curriculum it covers
  q:       'Question text',
  ch:      ['Choice A', 'Choice B', 'Choice C', 'Choice D'],
  ok:      [1],        // Indices of correct answers (0-based)
  multi:   false,      // true if multiple correct answers
  x:       'Optional code block or scenario context',
  e:       'Explanation shown after answering',
  c:       'Concept tag shown in monospace (short, technical)',
}
```

Rules for good questions:
- The question must be answerable by someone who read the curriculum
- Wrong answers must be plausible — not obviously wrong
- The explanation must say *why* the answer is correct, not just restate it
- The concept tag should be a compact technical reference (e.g. `RST: immediate abort | FIN: graceful close`)

### Add a protocol to the sandbox

See `docs/architecture.md` → "Adding a Protocol to the Sandbox".
Two steps, one new file.

### Add an anomaly detection rule

Edit `packages/core/src/anomaly/engine.js`.

Add a new object to the `RULES` array:

```js
{
  id:          'my_rule_id',
  name:        'Human-readable rule name',
  description: 'What this rule detects and why it matters',
  detect(flow, allFlows) {
    // Return null if the flow is not suspicious
    // Return an AnomalyAlert object if it is
    if (!isProblematic(flow)) return null
    return {
      flowId:      flow.id,
      ruleId:      'my_rule_id',
      severity:    'warning',   // 'info' | 'warning' | 'critical'
      title:       'Short title',
      description: 'Detailed description with context',
      timestamp:   Date.now(),
    }
  },
}
```

Write a test in `packages/core/tests/anomaly.test.js`.

### Add a Rust protocol parser

See `docs/architecture.md` → "Parser Extension".
Create `capture/src/parsers/<protocol>.rs`, implement `Parser`.

---

## Setup

```bash
# Requirements
# Node.js >= 18
# Rust >= 1.75 (for the capture backend only)
# libpcap-dev (Linux) or Xcode CLI tools (macOS)

# Clone
git clone https://github.com/netlens/netlens
cd netlens

# Install JS dependencies
npm install

# Start development server (opens all apps)
npm run dev

# Run all tests
npm test

# Build for production
npm run build
```

### Development URLs

```
http://localhost:3000   → Hub
http://localhost:3001   → Sandbox
http://localhost:3002   → Quiz
http://localhost:3003   → X-Ray (simulation mode)
```

### Capture backend (optional)

```bash
cd capture
cargo build

# Requires root or CAP_NET_RAW
sudo ./target/debug/netlens-capture

# Or grant capability (Linux — no sudo needed after this)
sudo setcap cap_net_raw,cap_net_admin=eip ./target/debug/netlens-capture
./target/debug/netlens-capture
```

---

## Code Standards

### JavaScript

- **No framework.** Vanilla JS only. If you reach for React,
  you are solving the wrong problem.
- **No hardcoded colors or sizes.** All visual values go through
  CSS custom properties defined in `tokens.css`.
- **No direct state mutation.** State changes via `dispatch(action)`.
- **No DOM manipulation in state files.** State is pure data.
- **No business logic in render files.** Render functions read
  state and update DOM. Nothing else.

### Rust

- Every parser implements the `Parser` trait — no exceptions.
- Every public function has a doc comment.
- Every parser has at least one test with a real PCAP fixture.
- `unwrap()` and `expect()` are forbidden in library code.
  Use `?` with proper error propagation.

### CSS

- All values from design tokens (`var(--token-name)`).
- Class names use BEM: `.block__element--modifier`.
- No `!important`. If you need it, the specificity is wrong.
- No inline styles in HTML. Styles belong in CSS files.

### Commits

Format: `type(scope): short description`

```
feat(sandbox): add WebSocket protocol steps
fix(quiz): correct TCP window answer explanation
docs(architecture): add anomaly rule extension guide
test(core): add DNS resolution chain assertions
refactor(xray): extract flow filtering to selectors
```

Types: `feat` `fix` `docs` `test` `refactor` `style` `chore`

---

## Pull Request Checklist

Before opening a PR, confirm:

- [ ] `npm test` passes with no new failures
- [ ] No hardcoded colors, sizes, or protocol data outside of core
- [ ] New protocol data is in `packages/core`, not in a view file
- [ ] New detection rule has a test
- [ ] Explanation text is readable by someone without a networking background
- [ ] Commit messages follow the format above
- [ ] PR description explains *why* the change is needed, not just *what* it does

---

## What We Will Not Merge

- Additions of npm runtime dependencies
- Changes that require a build step to work in development
- Hardcoded data in view or render files
- New features without tests for the core logic
- UI changes that break the design system
- Changes that make the curriculum harder to understand for a beginner

---

## Questions

Open a GitHub Discussion. Not an Issue — Issues are for bugs
and confirmed feature requests. Discussions are for questions,
proposals, and ideas.
