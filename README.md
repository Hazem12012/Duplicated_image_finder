# Duplicate Image Finder and Person Organizer

A Python tool that processes images to:
1. **Detect and delete duplicate images** across multiple folders using high-accuracy algorithms
2. **Identify lower resolution duplicates** so you know which ones are safe to delete
3. **Detect persons/faces** in images and organize them into separate folders
4. **Handle images without faces** by placing them in a "Not Detected Persons" folder

## Features

- **Multi-Folder Search**: Search for duplicates across one or more different folders
- **High-Accuracy Duplicate Detection**: Uses multiple hash algorithms (perceptual, difference, wavelet) + MD5 for exact matches
- **Resolution Analysis**: Shows resolution information for each duplicate, identifying which have lowest resolution
- **Smart Deletion**: Automatically keeps highest resolution images, marks lower resolution ones for deletion
- **Face Detection**: Automatically detects faces using CNN model (high accuracy) or HOG (fast)
- **Person Identification**: Groups images by detected persons (one folder per person)
- **Multiple Persons**: Images with multiple different persons go into a "Multiple Persons" folder
- **No Faces**: Images without detected faces go into "Not Detected Persons" folder
- **Safety First**: Moves duplicates to folder by default (can recover), asks for confirmation before deletion

## Requirements

- Python 3.7 or higher
- See `requirements.txt` for dependencies

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
pip install -r requirements.txt
```

**Note**: The `face-recognition` library requires `dlib`, which may need additional setup:
- **Windows**: You may need to install Visual Studio Build Tools
- **Linux/Mac**: Usually installs via pip, but may require cmake

If you encounter issues with `face-recognition`, you can install it using:
```bash
pip install face-recognition
```

## Usage

### Basic Usage

```bash
# Search in single folder
python main.py <source_directory>

# Search in multiple folders (compares across all folders)
python main.py <folder1> <folder2> <folder3>
```

This will:
- Scan for duplicates across all specified folders
- Show resolution information for each duplicate group
- Identify which duplicates have lowest resolution (safe to delete)
- Move lower resolution duplicates to `_duplicates` folder (or delete with confirmation)
- Detect faces and organize images into person folders
- Save organized images to `organized_images/` folder

### Advanced Usage

```bash
# Specify custom output directory
python main.py <source_directory> -o <output_directory>

# Search multiple folders
python main.py ./photos ./backup ./downloads

# Auto-delete lower resolution duplicates (no confirmation)
python main.py ./images --auto-delete-low-res

# Permanently delete duplicates (instead of moving to folder)
python main.py ./images --delete-duplicates

# Keep duplicate images (don't delete/move them)
python main.py ./images --keep-duplicates

# Stricter duplicate detection (lower threshold = stricter)
python main.py ./images --hash-threshold 3

# Faster face detection (less accurate)
python main.py ./images --fast-face-detection
```

### Examples

```bash
# Process images in single folder
python main.py photos

# Compare images across multiple folders
python main.py ./phone_photos ./camera_photos ./backup_photos

# Auto-delete lower resolution duplicates
python main.py ./images --auto-delete-low-res -o organized

# Stricter duplicate detection with custom output
python main.py ./photos --hash-threshold 3 -o sorted_photos
```

## How It Works

### 1. Duplicate Detection (High Accuracy)
- **Multi-Algorithm Approach**: Uses 3 different hash types:
  - Perceptual Hash (pHash) - detects visually similar images
  - Difference Hash (dHash) - detects similar layouts
  - Wavelet Hash (wHash) - detects similar patterns
- **MD5 Verification**: First checks for exact file duplicates using MD5
- **Cross-Folder Comparison**: Compares images across all specified folders
- **Resolution Analysis**: For each duplicate group:
  - Shows resolution (width x height) and total pixels
  - Shows file size
  - Identifies which images have lowest resolution
  - **Keeps highest resolution**, marks lower resolution for deletion

### 2. Duplicate Removal
- **Safety First**: Moves duplicates to `_duplicates` folder by default (can recover)
- **Smart Selection**: Automatically keeps the image with highest resolution
- **Confirmation**: Asks for confirmation before deletion (unless `--auto-delete-low-res`)
- **Detailed Report**: Shows detailed breakdown of each duplicate group with resolutions

### 3. Person Detection
- Uses face_recognition library with CNN model (high accuracy) by default
- Creates face encodings for each detected face
- Groups similar faces together (same person)
- Each unique person gets their own folder (Person_1, Person_2, etc.)

### 4. Organization
- Images are copied (not moved) to organized folders
- Original images remain in the source directory
- Folder structure:
  ```
  organized_images/
  ├── Person_1/
  ├── Person_2/
  ├── Multiple Persons/
  └── Not Detected Persons/
  
  _duplicates/  (lower resolution duplicates moved here)
  ```

## Supported Image Formats

- JPEG (.jpg, .jpeg)
- PNG (.png)
- BMP (.bmp)
- GIF (.gif)
- TIFF (.tiff)
- WebP (.webp)

## Notes

- The script **copies** images to organized folders (original files remain)
- Duplicate detection uses multiple algorithms for high accuracy
- **Resolution-based deletion**: Lower resolution duplicates are identified and can be safely deleted
- Duplicates are **moved** (not deleted) to `_duplicates` folder by default - you can recover them
- Face detection works best with clear, front-facing photos
- CNN model is more accurate but slower than HOG
- Person identification uses a tolerance threshold (default: 0.6)
- Hash threshold (default: 5) controls duplicate sensitivity - lower = stricter

## Troubleshooting

### face-recognition installation issues
If you have trouble installing `face-recognition`:
- Make sure you have cmake installed
- On Windows, you may need Visual Studio Build Tools
- Try: `pip install cmake` then `pip install face-recognition`

### Low face detection accuracy
- Ensure images are clear and faces are visible
- The script processes images as-is (no preprocessing)
- Consider adjusting the tolerance parameter in the code if needed

## License

This project is provided as-is for personal use.

