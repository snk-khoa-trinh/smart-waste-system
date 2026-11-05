# Continuous integration

[Repository guide](../README.md) · [Agent rules](AGENTS.md)

`workflows/ci.yaml` checks Python lint/tests/migrations, Nub frontend lint/tests/
build, isolated mock Compose integration, native firmware logic and both active
firmware environments (`camera`, `station`). Test source remains committed so a
fresh checkout can reproduce these checks. Generated results and private device
configuration stay ignored; production Docker build contexts exclude tests.

Hardware uploads, physical actuation and paid Roboflow requests are not CI tasks.
The integration job creates an isolated demo stack and disposes of its own volumes;
that cleanup command must not be run against the user's live hardware deployment.
