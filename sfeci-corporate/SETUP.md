# Setup Instructions for GitHub Upload

## Step 1: Copy Screenshots to Project

To include the security screenshots in your GitHub repository, copy the following files from the brain directory to a `screenshots` folder in your project:

### Create Screenshots Directory
```bash
mkdir screenshots
```

### Copy Screenshot Files

**From**: `C:\Users\20102\.gemini\antigravity\brain\06f6fb9b-b6d9-4d08-9882-6d5a63c98281\`

**To**: `C:\Users\20102\.gemini\antigravity\scratch\sfeci-corporate\screenshots\`

**Files to copy**:
1. `sfeci_hero_section_1769696165616.png`
2. `sfeci_sectors_grid_1769696346876.png`
3. `sfeci_rfq_form_1769696511376.png`
4. `sql_injection_test_1769697370834.png`
5. `xss_protection_test_1769697411897.png`
6. `file_upload_security_1769697480237.png`

### PowerShell Command
```powershell
# Create screenshots directory
New-Item -ItemType Directory -Path "screenshots" -Force

# Copy all screenshots
Copy-Item "C:\Users\20102\.gemini\antigravity\brain\06f6fb9b-b6d9-4d08-9882-6d5a63c98281\sfeci_hero_section_1769696165616.png" -Destination "screenshots\"
Copy-Item "C:\Users\20102\.gemini\antigravity\brain\06f6fb9b-b6d9-4d08-9882-6d5a63c98281\sfeci_sectors_grid_1769696346876.png" -Destination "screenshots\"
Copy-Item "C:\Users\20102\.gemini\antigravity\brain\06f6fb9b-b6d9-4d08-9882-6d5a63c98281\sfeci_rfq_form_1769696511376.png" -Destination "screenshots\"
Copy-Item "C:\Users\20102\.gemini\antigravity\brain\06f6fb9b-b6d9-4d08-9882-6d5a63c98281\sql_injection_test_1769697370834.png" -Destination "screenshots\"
Copy-Item "C:\Users\20102\.gemini\antigravity\brain\06f6fb9b-b6d9-4d08-9882-6d5a63c98281\xss_protection_test_1769697411897.png" -Destination "screenshots\"
Copy-Item "C:\Users\20102\.gemini\antigravity\brain\06f6fb9b-b6d9-4d08-9882-6d5a63c98281\file_upload_security_1769697480237.png" -Destination "screenshots\"
```

## Step 2: Update README.md Screenshot Paths

After copying the screenshots, update the paths in README.md:

**Change from**:
```markdown
![Hero Section](../brain/06f6fb9b-b6d9-4d08-9882-6d5a63c98281/sfeci_hero_section_1769696165616.png)
```

**Change to**:
```markdown
![Hero Section](screenshots/sfeci_hero_section_1769696165616.png)
```

Do this for all 6 screenshot references in the README.md file.

## Step 3: Initialize Git Repository

```bash
cd C:\Users\20102\.gemini\antigravity\scratch\sfeci-corporate

# Initialize git
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: SFECI Corporate Website with full interactivity and security"
```

## Step 4: Create GitHub Repository

1. Go to https://github.com/new
2. Create a new repository named `sfeci-corporate`
3. Don't initialize with README (we already have one)
4. Click "Create repository"

## Step 5: Push to GitHub

```bash
# Add remote repository (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/sfeci-corporate.git

# Push to GitHub
git branch -M main
git push -u origin main
```

## Step 6: Verify

Visit your GitHub repository and verify:
- ✅ README.md displays correctly
- ✅ Screenshots are visible
- ✅ All files are present
- ✅ Code syntax highlighting works

## Final Project Structure

```
sfeci-corporate/
├── screenshots/
│   ├── sfeci_hero_section_1769696165616.png
│   ├── sfeci_sectors_grid_1769696346876.png
│   ├── sfeci_rfq_form_1769696511376.png
│   ├── sql_injection_test_1769697370834.png
│   ├── xss_protection_test_1769697411897.png
│   └── file_upload_security_1769697480237.png
├── index.html
├── index.css
├── script.js
├── security.js
├── README.md
└── SETUP.md (this file)
```

## Optional: Add .gitignore

Create a `.gitignore` file:

```
# OS files
.DS_Store
Thumbs.db

# Editor files
.vscode/
.idea/
*.swp
*.swo

# Logs
*.log

# Temporary files
*.tmp
```

## Need Help?

If you encounter any issues:
1. Check that all files are in the correct locations
2. Verify screenshot paths in README.md
3. Ensure Git is installed: `git --version`
4. Check GitHub authentication is set up

---

**You're all set!** Your SFECI Corporate Website is ready for GitHub! 🚀
