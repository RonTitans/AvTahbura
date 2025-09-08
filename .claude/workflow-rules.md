# WORKFLOW RULES FOR AVTAHBURA PROJECT

## 🚨 GOLDEN RULES

1. **NEVER work directly on main branch**
2. **ALWAYS work on dev branch**
3. **ONLY merge dev → main after testing on staging**

## 📋 Daily Workflow

### Starting Work:
```bash
git checkout dev
git pull origin dev  # Get latest changes
```

### Making Changes:
1. Edit files locally
2. Test locally (http://localhost:8009)
3. Commit to dev:
```bash
git add .
git commit -m "fix: description"
git push origin dev
```
4. Vercel auto-deploys to STAGING
5. Test on staging URL
6. If good, merge to main

### Deploy to Production:
```bash
git checkout main
git pull origin main
git merge dev
git push origin main
```

## 🎯 Current Status
- Working branch: dev
- Production has: Old code (no button fixes)
- Staging has: New code (with button fixes)
- Local: Always sync with dev

## ⚠️ REMINDERS FOR CLAUDE
- Always use `git checkout dev` first
- Never commit directly to main
- Test on staging before production
- Keep dev branch as source of truth