#!/bin/bash
set -ex
git checkout -b clean_main
git reset --hard 6f1d114

# Squash build fixes
git cherry-pick 7db5b9f 73093e6 131230f a99c1d4 02e65c1 161e1b9 b76141f
git reset --soft 6f1d114
git commit -m "fix: resolve server-side build and rollup dependencies"

# Apply intermediate commits
git cherry-pick bc654aa 38c2244 064a767 fe909bd 48c6afc 3a0583f

# Store the commit hash before the broadcast block
PRE_BROADCAST=$(git rev-parse HEAD)

# Squash ad broadcast jobs
git cherry-pick 5c65bc7 dae42dc 5807611 e4f2500 2ecb18d
git reset --soft $PRE_BROADCAST
git commit -m "feat: implement robust ad broadcast cleanup background jobs"

# Apply the rest
git cherry-pick 6ffdf10 4e92336 58aad25

# Force move main to clean_main
git branch -f main clean_main
git checkout main
git branch -D clean_main
