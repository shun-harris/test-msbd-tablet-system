# VS Code Workspace Setup

## 📁 Working with Both Projects

You have **two options** for working with both the Tablet System and Custom CRM:

---

## ✅ Option 1: Multi-Root Workspace (Recommended)

**Benefit**: See both projects in the same VS Code window with separate folder trees.

### Setup
A workspace file has been created: `C:\Users\Shun Harris\Documents\MyDanceDesk-Workspace.code-workspace`

### How to Use
1. Open the workspace file:
   ```powershell
   code "C:\Users\Shun Harris\Documents\MyDanceDesk-Workspace.code-workspace"
   ```

2. Your VS Code Explorer will show:
   ```
   EXPLORER
   ├── 📁 Check-In Tablet System
   │   ├── index.html
   │   ├── server.js
   │   ├── docs/
   │   └── ...
   └── 📁 MyDanceDesk
       ├── packages/
       ├── docs/
       └── ...
   ```

### Features
- ✅ Switch between projects instantly
- ✅ Search across both projects
- ✅ Separate Git status for each
- ✅ Separate terminal sessions
- ✅ Cross-reference files easily

### Tips
- **Open file**: `Ctrl+P` shows files from both projects
- **Search**: `Ctrl+Shift+F` searches both projects
- **Terminal**: Each project can have its own terminal
- **Source Control**: Git panel shows both repos separately

---

## Option 2: Separate Windows

**Benefit**: Complete isolation, good for focused work on one project.

### How to Use
1. Open Tablet System:
   ```powershell
   code "C:\Users\Shun Harris\Documents\Check In Tablet System"
   ```

2. Open CRM (in new window):
   ```powershell
   code "C:\Users\Shun Harris\Documents\MyDanceDesk" --new-window
   ```

3. Use `Alt+Tab` to switch between windows

---

## 🎯 Recommended Workflow

### Daily Development
Use **Multi-Root Workspace** so you can:
1. Edit CRM customizations
2. Update tablet integration code
3. Keep documentation in sync
4. Test both systems together

### Terminal Setup in Multi-Root Workspace
You can open terminals for each project:

```powershell
# Terminal 1: CRM Backend
cd "C:\Users\Shun Harris\Documents\MyDanceDesk"
yarn workspace twenty-server start:dev

# Terminal 2: CRM Frontend  
cd "C:\Users\Shun Harris\Documents\MyDanceDesk"
yarn workspace twenty-front start

# Terminal 3: Tablet System
cd "C:\Users\Shun Harris\Documents\Check In Tablet System"
npm run dev
```

VS Code will remember which terminal belongs to which project!

---

## 💡 Workspace Features You'll Love

### 1. Unified Search
Search for "Member" across both projects to see:
- CRM: Member object definition
- Tablet: Member check-in code
- Docs: Member-related documentation

### 2. Cross-Project Navigation
- Click a file path in CRM docs that references tablet system
- VS Code opens it from the other project folder!

### 3. Separate Git Controls
The Source Control panel shows:
```
SOURCE CONTROL
├── Check-In Tablet System (Git)
│   ├── Modified: server.js
│   └── Branch: prod-release
└── MyDanceDesk (Git)
    ├── Modified: member.workspace-entity.ts
    └── Branch: main
```

Commit to each repo independently!

### 4. Project-Specific Settings
Settings in workspace file apply to both projects:
- Exclude node_modules from search
- Consistent formatting rules
- Shared extensions

---

## 🔧 Customizing Your Workspace

Edit `MyDanceDesk-Workspace.code-workspace` to:

### Add Extensions
```json
{
  "extensions": {
    "recommendations": [
      "dbaeumer.vscode-eslint",
      "esbenp.prettier-vscode",
      "GraphQL.vscode-graphql",
      "ms-vscode.powershell"
    ]
  }
}
```

### Add Tasks
```json
{
  "tasks": {
    "version": "2.0.0",
    "tasks": [
      {
        "label": "Start CRM Backend",
        "type": "shell",
        "command": "yarn workspace twenty-server start:dev",
        "options": {
          "cwd": "${workspaceFolder:MyDanceDesk}"
        }
      },
      {
        "label": "Start Tablet Server",
        "type": "shell", 
        "command": "npm run dev",
        "options": {
          "cwd": "${workspaceFolder:Check-In Tablet System}"
        }
      }
    ]
  }
}
```

---

## 🎯 Quick Start

1. **Open workspace**:
   ```powershell
   code "C:\Users\Shun Harris\Documents\MyDanceDesk-Workspace.code-workspace"
   ```

2. **Trust the workspace** (VS Code will prompt)

3. **Open terminals**:
   - New Terminal → Select "MyDanceDesk" from dropdown
   - New Terminal → Select "Check-In Tablet System" from dropdown

4. **Start developing!** 🚀

---

## 📚 VS Code Multi-Root Workspace Docs

- [Official Documentation](https://code.visualstudio.com/docs/editor/multi-root-workspaces)
- Keyboard shortcut: `Ctrl+R` to switch between recent workspaces

---

**Recommendation**: Use the multi-root workspace! It makes development way smoother when working across both projects. 🎉
