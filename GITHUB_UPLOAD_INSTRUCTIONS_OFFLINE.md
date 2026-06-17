# GitHub upload instructions (no `git push`)

## Why
`git push` cannot reach `https://github.com` (port 443) from this machine, so the repo stays empty.

## Upload using GitHub UI (works even with no git)
1. Open your repository on GitHub.
2. Click **Add file → Upload files**.
3. Upload a zip file that contains your project.

## Create a zip of this folder
From **Command Prompt** (cmd.exe) in:
`c:\Users\USER\Downloads\agriconnect farm project`

Run (Windows PowerShell must be available):

```bat
powershell -NoProfile -Command "Compress-Archive -Force -Path .\* -DestinationPath .\agriconnect-project.zip"
```

If you can’t run PowerShell, use Windows Explorer: right-click the project folder → **Send to → Compressed (zipped) folder**.

## Verify on GitHub
After upload finishes, GitHub should show `agriconnect-project.zip` (or the files) in the repo.

