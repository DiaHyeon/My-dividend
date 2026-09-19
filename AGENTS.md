# My dividend

Read BRIEF.md before doing anything. It is the single source of truth and contains all latest specifications, architecture, and features.

## Rules
- Stack is Expo + TypeScript (Expo SDK 57).
- Read the exact versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
- All monetary and share counts must be NUMERIC(15, 4) (never use FLOAT or REAL).
- Every Supabase table must have Row Level Security (RLS) enabled.
- Never commit secret keys or sensitive URLs into version control; keep them in .env.
- Explain any file you create, in one sentence.
- Always run Expo with `--tunnel` mode (`node ./node_modules/expo/bin/cli start --tunnel --go --web`) due to network AP isolation.

