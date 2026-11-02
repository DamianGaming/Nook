# Getting the Nook Windows app

There are two ways to get the installer (`Nook-Setup.exe`). Pick one.

## A. On your own Windows PC (quickest, no GitHub needed)

1. Install **Node.js** (the LTS version) from https://nodejs.org if you do not have it.
2. In the main Nook folder, copy `.env.example` to `.env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the same values the website uses).
3. Open the `desktop` folder and double-click **`build-windows.bat`**.
4. Wait a few minutes. When it finishes, a `release` folder opens with **`Nook-Setup.exe`**. Run it to install Nook.

To just try the app without installing it, open a terminal in `desktop` and run `npm install` then `npm start`.

## B. Let GitHub build it for you

1. **The workflow file must be at the top of your repository** (`.github/workflows/desktop.yml`). The rest of the project (`desktop/`, `src/`, `package.json`) can be at the top too, or inside one folder such as `nook`; the workflow finds it either way. If you see "Could not find desktop/main.js" or "files are missing", upload the complete contents of `nook.zip`.
2. **Turn Actions on:** repository **Settings > Actions > General**, allow actions, and under *Workflow permissions* choose **Read and write permissions**. Save.
3. **Add your keys:** **Settings > Secrets and variables > Actions > New repository secret**. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. **Run it:** open the **Actions** tab, choose **Build Windows app** in the left list, press **Run workflow**. (It also runs by itself when you push changes to `main` or `master`.)
   - If the list on the left is empty, the workflow file is not on your default branch yet, or it is in the wrong folder (step 1).
5. When the run turns green (about 5 to 10 minutes), open it and download **Nook-Setup** from the *Artifacts* section at the bottom. Unzip it to get `Nook-Setup.exe`.

### Making a public release (for auto updates and the website download button)

1. Push a tag that is just a version number with a `v` in front: `git tag v1.0.1` then `git push origin v1.0.1`. (Numbers only, like `v1.0.1`. Each new release needs a **higher** number than the last, or installed apps will not see it as an update.)
2. GitHub builds the app, sets its version from the tag, and creates a **Release** with `Nook-Setup.exe` attached. You do not edit any version number by hand.
3. Installed apps check for new releases 15 seconds after starting and every 4 hours. They download quietly, show "Nook 1.0.1 is ready to install" with a **Restart** button, and otherwise install when you quit Nook. After the silent install Nook opens again by itself.
4. On the website, set `VITE_GITHUB_REPO=owner/repo` and rebuild. The home page's **Download for Windows** button then downloads the latest installer.

**Auto updates need the repository to be public** (the app reads the release without a login). In a private repository the download button and updates will not work.

**Checking an update worked:** right-click the Nook tray icon > **Check for updates** shows "Nook is up to date" or the problem; **Open update log** opens `updater.log` with the details. Updates only run in the installed app, not when started from source.

**Windows SmartScreen:** an unsigned installer shows a "Windows protected your PC" warning the first time. To remove it, buy a code-signing certificate and add two repository secrets, `WIN_CSC_LINK` (the .pfx file, base64 encoded, or a link to it) and `WIN_CSC_KEY_PASSWORD`. The workflow signs automatically when they exist. Nothing is signed otherwise.

## If something fails

- **"The directory name is invalid ... desktop" or "Could not read package.json":** your repository does not have the `desktop` folder. Unzip `nook.zip` and upload the **whole `desktop` folder** (and `.github`, `WINDOWS_APP.md`, `.gitignore`) to the repository. On GitHub: **Add file > Upload files**, drag the folders in (hidden folders like `.github` may not show in your file explorer, so turn on "Hidden items", or use GitHub Desktop or `git add -A`). Then open the repository and check you can see `desktop/main.js` before running the workflow again. Easiest of all: replace everything in the repository with the contents of the new zip.

- **"Add the secrets..." error:** step 3 above is missing.
- **Run is red:** open it, click the red step and read the last lines. Send them to me and I will fix it.
- **Windows says "protected your PC" (SmartScreen):** click *More info*, then *Run anyway*. The installer is not code-signed yet.
