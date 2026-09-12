# Steering Rules

This file tracks high-level behavioral and architectural directives for the AI agent working on this repository.

## Rules
1. **Faked / Hardcoded Reminders**: Every time the user asks "what's next?", the agent MUST remind the user of everything in the website that is currently faked, mocked, or hardcoded (e.g., simulated timeouts instead of contract calls).
2. **Commit Language**: Never say committed or pushed without specifying the branch it was committed/pushed to, and always specify if you merged to main or not.

## Design & UI Principles
* **Audio & Haptics**: Use a strong, centralized audio library for site-wide haptics and sounds. Provide a small, ubiquitous icon to disable it.
* **Animated Elements**: Primary buttons (like the Swap button) should be highly animated, morphing smoothly between states (loading, disabled, active).
* **User-Centric Language**: Frame complex DeFi concepts simply. For example, frame slippage as a bar showing "How good of a deal this trade is?" with a tooltip for the technical explanation.
* **Login UX**: Always surface the last account/method used to sign in to prevent account fragmentation.
