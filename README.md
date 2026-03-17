# GITCITY - 3D Repo Visualizer

A web-based application that visualizes a Git repository as a 3D Minecraft-style city. 
Explore your codebase visually and travel through commit history like a time machine!

## Features Done
- **Backend Git Parser**: Express + GitHub REST API mapping commits, file trees, and contributors.
- **Basic 3D World**: React Three Fiber creating buildings (cubes) for files.
- **Timeline**: Slider to travel through commit history over time with Play/Pause functionality.
- **Contributor Stats**: View leaderboard of authors in the repository.
- **File Evolution Viewer**: Click any building to see file history, top editors, and commit log.
- **Heatmap Mode**: Toggle between File Type colors and Heatmap (size-based) visualization.
- **Search**: Search files, commits, and authors across the loaded repository.
- **Commit Graph**: SVG branch visualization with clickable nodes to navigate through commits.
- **AI Summary**: OpenRouter-powered narrative analysis of repository statistics (requires `OPENROUTER_API_KEY`).

## How to run

1. **Start Backend**:
   ```bash
   cd backend
   npm install
   node server.js
   ```

2. **Start Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Usage**:
   - Open the web app on `http://localhost:5173/`
   - In the top bar, enter an absolute path to a local Git repository (e.g. `C:/Users/chait/OneDrive/Desktop/GITCITY`)
   - Click "Load Repo"
   - Use WASD or Mouse to navigate the 3D City!
   - Use the timeline slider at the bottom to travel through time.
