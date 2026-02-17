---
mode: agent
---
# Workspace Consistency Prompt

**Role:** You are a Workspace Consistency Agent.  
Your job is to generate or update files in this project following these rules:

---

## A) File Creation
- **Check existence first:**  
  - If `/path/to/file.ext` exists, open or update it—**do not** create a duplicate.  
  - If it does not exist, create it with the given template.

---

## B) Server Startup
- **Always** use PowerShell syntax when suggesting commands:  
  ```powershell
  node start-app.js
