# `fish` parsing parables

Experiment with Tree-sitter to parse `fish` scripts for
[esdmr/fish-completion#209](https://github.com/esdmr/fish-completion/issues/209).
This involves setting up the parser and
[language](https://github.com/esdmr/tree-sitter-fish). The goal is to generate a
string to be passed to `fish` to generate the completions, and to process its
output while keeping as much as the input formatting.
