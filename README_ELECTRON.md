# Duplicate Image Finder - Electron App

A modern Electron.js desktop application for finding duplicate images and organizing them by detected persons.

## Features

- 🖥️ **Modern Electron UI** - Beautiful, responsive desktop interface
- 🔍 **Multi-Folder Search** - Search for duplicates across multiple folders
- 📊 **Resolution Analysis** - See which duplicates have lowest resolution
- 👥 **Person Organization** - Automatically organize images by detected persons
- 🛡️ **Safe Deletion** - Moves duplicates to folder by default (recoverable)

## Installation

### Prerequisites

- Node.js (v16 or higher)
- Python 3.7 or higher
- npm or yarn

### Steps

1. **Install Node.js dependencies:**
```bash
npm install
```

2. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

## Running the Application

### Development Mode

1. **Start the Python API server:**
```bash
python api_server.py
```

2. **In a new terminal, start Electron:**
```bash
npm start
```

Or with dev tools:
```bash
npm run dev
```

### Production Build

Build the application for your platform:

```bash
npm run build
```

This will create distributable packages in the `dist/` folder.

## Project Structure

```
.
├── main.js              # Electron main process
├── preload.js           # Preload script (security)
├── renderer.js          # UI logic (renderer process)
├── index.html           # UI markup
├── styles.css           # Styling
├── api_server.py        # Python Flask API server
├── image_processor.py   # Backend image processing logic
├── package.json         # Node.js dependencies
└── requirements.txt     # Python dependencies
```

## How It Works

1. **Electron Frontend**: Modern web-based UI built with HTML/CSS/JavaScript
2. **Python Backend**: Flask API server that handles all image processing
3. **Communication**: Electron app communicates with Python server via HTTP REST API

## API Endpoints

The Python server exposes these endpoints:

- `GET /health` - Health check
- `POST /api/find-duplicates` - Find duplicate images
- `POST /api/delete-duplicates` - Delete/move duplicates
- `POST /api/organize-by-person` - Organize images by detected persons

## Usage

1. **Select Folder(s)**: Click "Select Folder(s)" to choose one or more image folders
2. **Configure Settings**: Adjust similarity threshold, hash threshold, and other options
3. **Scan Images**: Click "Scan Images" to find duplicates
4. **Review Results**: See duplicate groups with resolution information
5. **Delete Duplicates**: Click "Delete Duplicates" to remove lower resolution copies
6. **Organize by Person**: Click "Organize by Person" to group images by detected faces

## Troubleshooting

### Python server not starting

- Make sure Python is installed and in PATH
- Check that all Python dependencies are installed: `pip install -r requirements.txt`
- Verify port 5000 is not in use

### Electron app can't connect to Python server

- Make sure the Python server is running first
- Check the console for connection errors
- Verify the API server is accessible at `http://localhost:5000`

### Face detection not working

- Ensure `face-recognition` library is properly installed
- On Windows, you may need Visual Studio Build Tools
- Try using the faster HOG model instead of CNN

## Development

### Making Changes

- **UI Changes**: Edit `index.html`, `styles.css`, or `renderer.js`
- **Backend Logic**: Edit `image_processor.py`
- **API Endpoints**: Edit `api_server.py`
- **Electron Config**: Edit `main.js` or `package.json`

### Debugging

- Use `npm run dev` to open DevTools automatically
- Check Python server logs in the terminal
- Check Electron console in DevTools

## License

MIT

