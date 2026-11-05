# Documentation agent rules

Read [root baseline](../AGENTS.md) and [documentation map](README.md).

- Root README is a short architecture/setup map; folder READMEs own their commands.
  Keep relative Markdown links valid after moves and update relevant agent guides.
- Current firmware environments are camera/station. Mark older bring-up commands
  as historical instead of presenting removed targets/tools as active setup.
- Preserve meaningful evidence and corrections. Distinguish compiled, flashed,
  transport-verified, correctly imaged, classified and physically sorted results.
- Report real versus synthetic data and provisional calibration honestly. An
  Unknown/disabled outcome proves rejection handling, not physical sorting.
- Keep secrets, private environment/header contents and private images out of docs.
- For documentation-only edits validate links and `git diff --check`; execute
  commands only when appropriate and never use paid inference or motors just to
  check a code block. Cross-check command paths against the current tree.
