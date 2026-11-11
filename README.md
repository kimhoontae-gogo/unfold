# unfold

An agent skill for agreeing on what a feature does before any code is written.

The agent writes a short scope document made of sequence diagrams: who does what to whom, in order. What the user asked for is kept apart from what the AI assumed or added, so the extras can be cut in chat before implementation. The confirmed document is a Markdown file in your repository and becomes the reference for the implementation.

The skill is instructions only. There is nothing to install or run.

## Install

Copy the `skill/` folder into your agent's skills folder and name it `unfold`.

## Use

Ask the agent for a feature and say you want to settle the scope first ("unfold this", "scope this first"). The agent writes `specs/<feature>/scope.md`. Read it where Mermaid diagrams render, such as GitHub or an editor's Markdown preview, and give feedback in chat by ID ("drop A4.y", "A3 should be 5 minutes").

See [examples/subscription-renewal/scope.md](examples/subscription-renewal/scope.md) for what a document looks like, and [skill/SKILL.md](skill/SKILL.md) for the rules the agent follows.

## History

Earlier versions drew the scope as a drill-down flow graph in a local browser viewer. In use, sequence diagrams turned out to be easier to read, and plain Markdown was enough to carry them. The viewer code remains in the git history.
