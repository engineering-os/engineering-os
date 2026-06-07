#!/bin/bash
# Demo script for Engineering OS — recorded with asciinema

type_cmd() {
  local cmd="$1"
  printf "\033[32m$\033[0m "
  for ((i=0; i<${#cmd}; i++)); do
    printf "${cmd:$i:1}"
    sleep 0.04
  done
  printf "\n"
  sleep 0.3
}

out() {
  printf "%b\n" "$1"
  sleep 0.08
}

ai_type() {
  local text="$1"
  for ((i=0; i<${#text}; i++)); do
    printf "${text:$i:1}"
    sleep 0.015
  done
  printf "\n"
}

clear
sleep 0.5

# ═══════════════════════════════════════
# PART 1: Setup
# ═══════════════════════════════════════

type_cmd "npm install -g engineering-os"
sleep 0.5
out ""
out "added 47 packages in 3.2s"
out ""
sleep 0.8

type_cmd "cd my-saas-project"
sleep 0.3
type_cmd "eos init --claude --cursor"
sleep 0.5
out ""
out "\033[1m\033[36m⚡ Engineering OS\033[0m \033[2m— Initializing...\033[0m"
out ""
sleep 0.3
out "\033[2mIndexing repository...\033[0m"
sleep 0.4
out "\033[32m✓\033[0m Repository indexed \033[2m(127 files, 892 chunks)\033[0m"
sleep 0.3
out "\033[2mDiscovering architecture...\033[0m"
sleep 0.4
out "\033[32m✓\033[0m Architecture discovered \033[2m(4 services, 2 patterns)\033[0m"
sleep 0.3
out "\033[32m✓\033[0m Graph built \033[2m(23 calls, 1 contract)\033[0m"
out "\033[32m✓\033[0m CLAUDE.md generated"
out "\033[32m✓\033[0m .cursor/rules/ generated \033[2m(5 files)\033[0m"
out ""
out "\033[1m\033[32m✨ Engineering OS initialized!\033[0m"
out ""
sleep 1.5

# ═══════════════════════════════════════
# PART 2: Claude Code Session
# ═══════════════════════════════════════

clear
sleep 0.3
out "\033[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
out "\033[1m  Claude Code Session\033[0m \033[2m(with Engineering OS connected)\033[0m"
out "\033[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
out ""
sleep 0.8

out "\033[36m❯\033[0m \033[1mYou:\033[0m Add a password reset feature to the auth service"
out ""
sleep 1

out "\033[33m⚡ Claude calls\033[0m \033[2meos_context\033[0m\033[33m(\033[0m{ task: \"password reset auth\" }\033[33m)\033[0m"
sleep 0.8
out ""
out "\033[2m┌─ Context returned ──────────────────────────────────────────────────┐\033[0m"
out "\033[2m│\033[0m \033[1mProject:\033[0m my-saas-project (NestJS monorepo)"
out "\033[2m│\033[0m \033[1mAuth routes:\033[0m POST /auth/login, POST /auth/register, GET /auth/me"
out "\033[2m│\033[0m \033[1mConvention:\033[0m Use Result<T> pattern, never throw in services"
out "\033[2m│\033[0m \033[1mDecision:\033[0m Redis for session/token storage (DEC-001)"
out "\033[2m│\033[0m \033[1mPattern:\033[0m Repository pattern for all DB access"
out "\033[2m│\033[0m \033[1mKey files:\033[0m src/auth/auth.service.ts, src/auth/auth.controller.ts"
out "\033[2m└──────────────────────────────────────────────────────────────────────┘\033[0m"
out ""
sleep 1.5

out "\033[35m◆\033[0m \033[1mClaude:\033[0m"
ai_type "  I can see the auth service uses the Result<T> pattern and Redis for tokens."
ai_type "  I'll add the password reset following your existing conventions:"
out ""
sleep 0.5
out "  \033[2m1.\033[0m Add \033[36mPOST /auth/forgot-password\033[0m endpoint"
out "  \033[2m2.\033[0m Add \033[36mPOST /auth/reset-password\033[0m endpoint"
out "  \033[2m3.\033[0m Store reset token in Redis (TTL: 15min) — per DEC-001"
out "  \033[2m4.\033[0m Use Result<T> wrapper — per your conventions"
out ""
sleep 1.5

# ═══════════════════════════════════════
# PART 3: Decision Recall
# ═══════════════════════════════════════

out "\033[33m⚡ Claude calls\033[0m \033[2meos_recall_decision\033[0m\033[33m(\033[0m{ query: \"token storage\" }\033[33m)\033[0m"
sleep 0.8
out ""
out "\033[2m┌─ Decision recalled ─────────────────────────────────────────────────┐\033[0m"
out "\033[2m│\033[0m \033[1mDEC-001:\033[0m Redis for session & token storage"
out "\033[2m│\033[0m \033[1mRationale:\033[0m Sub-ms reads, built-in TTL expiry, horizontal scaling"
out "\033[2m│\033[0m \033[1mAlternatives rejected:\033[0m PostgreSQL (too slow), JWT-only (no revocation)"
out "\033[2m└──────────────────────────────────────────────────────────────────────┘\033[0m"
out ""
sleep 1.2

out "\033[35m◆\033[0m \033[1mClaude:\033[0m"
ai_type "  Using Redis with TTL for the reset token — matches your existing decision."
ai_type "  Not using JWT because you rejected it for lack of revocation."
out ""
sleep 1.5

# ═══════════════════════════════════════
# PART 4: Skill Learning
# ═══════════════════════════════════════

out "\033[33m⚡ Claude calls\033[0m \033[2meos_learn\033[0m\033[33m(\033[0m{ type: \"gotcha\", ... }\033[33m)\033[0m"
sleep 0.5
out ""
out "\033[2m┌─ Skill persisted ───────────────────────────────────────────────────┐\033[0m"
out "\033[2m│\033[0m \033[1mType:\033[0m gotcha"
out "\033[2m│\033[0m \033[1mContent:\033[0m Reset tokens must be single-use — delete from Redis"
out "\033[2m│\033[0m         after first verification to prevent replay attacks"
out "\033[2m│\033[0m \033[1mTags:\033[0m auth, security, redis, tokens"
out "\033[2m└──────────────────────────────────────────────────────────────────────┘\033[0m"
out ""
sleep 1

out "\033[35m◆\033[0m \033[1mClaude:\033[0m"
ai_type "  Saved this as a security gotcha. Next time anyone touches auth tokens,"
ai_type "  Engineering OS will remind me about single-use enforcement."
out ""
sleep 1.5

# ═══════════════════════════════════════
# PART 5: Planning
# ═══════════════════════════════════════

clear
sleep 0.3
out "\033[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
out "\033[1m  Planning with Engineering OS\033[0m"
out "\033[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
out ""
sleep 0.8

out "\033[36m❯\033[0m \033[1mYou:\033[0m Plan adding real-time notifications across mobile + backend"
out ""
sleep 1

out "\033[33m⚡ Claude calls\033[0m \033[2meos_build\033[0m\033[33m(\033[0m{ requirement: \"real-time notifications\", mode: \"plan-only\" }\033[33m)\033[0m"
sleep 1
out ""
out "\033[1m\033[36m📋 Execution Plan\033[0m"
out ""
out "  \033[1mAffected services:\033[0m"
out "    • auth-service \033[2m(notification preferences)\033[0m"
out "    • payments-service \033[2m(payment event triggers)\033[0m"
out "    • mobile-app \033[2m(push notification UI)\033[0m \033[33m← cross-repo\033[0m"
out ""
out "  \033[1mExecution steps:\033[0m"
out "    \033[32m1.\033[0m [BE] Add notification-service module      \033[2m(new)\033[0m"
out "    \033[32m2.\033[0m [BE] WebSocket gateway for real-time push  \033[2m(new)\033[0m"
out "    \033[32m3.\033[0m [BE] Event triggers in payments-service    \033[2m(modify)\033[0m"
out "    \033[32m4.\033[0m [FE] Push notification component           \033[2m(mobile-app)\033[0m"
out "    \033[32m5.\033[0m [FE] Notification preferences screen       \033[2m(mobile-app)\033[0m"
out ""
out "  \033[1mReuses:\033[0m Redis pub/sub (already in stack per DEC-001)"
out "  \033[1mRisk:\033[0m WebSocket scaling — recommend starting with polling fallback"
out ""
sleep 2.5

# Outro
out ""
out "\033[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
out ""
out "\033[1m  Your AI knows your project. Recalls your decisions. Learns as you go.\033[0m"
out ""
out "  \033[32m$\033[0m npm install -g engineering-os"
out "  \033[2mgithub.com/engineering-os/engineering-os\033[0m"
out ""
out "\033[2m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\033[0m"
sleep 3
