#!/usr/bin/env python3
"""
ImageProcessor class for duplicate detection and person organization
This is the backend logic used by the API server
"""

import os
import shutil
import hashlib
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, Tuple, Optional
import imagehash
from PIL import Image
import face_recognition
import numpy as np


class ImageProcessor:
    def __init__(self, source_dirs: List[str], output_dir: str = "organized_images", 
                 hash_threshold: int = 5, use_cnn: bool = True):
        """
        Initialize the Image Processor
        
        Args:
            source_dirs: List of directories containing source images
            output_dir: Directory where organized images will be placed
            hash_threshold: Maximum hash difference to consider images as duplicates (0-64, lower = stricter)
            use_cnn: Use CNN model for face detection (more accurate but slower)
        """
        if isinstance(source_dirs, str):
            source_dirs = [source_dirs]
        
        self.source_dirs = [Path(d) for d in source_dirs]
        self.output_dir = Path(output_dir)
        self.supported_formats = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff', '.webp'}
        self.known_faces = {}
        self.person_counter = 0
        self.hash_threshold = hash_threshold
        self.use_cnn = use_cnn
        self.face_model = 'cnn' if use_cnn else 'hog'
        
    def get_image_files(self) -> List[Path]:
        """Get all supported image files from all source directories"""
        image_files = []
        for source_dir in self.source_dirs:
            if not source_dir.exists():
                continue
            for ext in self.supported_formats:
                image_files.extend(source_dir.rglob(f'*{ext}'))
                image_files.extend(source_dir.rglob(f'*{ext.upper()}'))
        return image_files
    
    def calculate_md5_hash(self, file_path: Path) -> Optional[str]:
        """Calculate MD5 hash of a file for exact duplicate detection"""
        try:
            hash_md5 = hashlib.md5()
            with open(file_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_md5.update(chunk)
            return hash_md5.hexdigest()
        except Exception as e:
            return None
    
    def calculate_image_hashes(self, image_path: Path) -> Optional[Dict]:
        """Calculate multiple hash types for more accurate duplicate detection"""
        try:
            with Image.open(image_path) as img:
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                phash = imagehash.phash(img)
                dhash = imagehash.dhash(img)
                whash = imagehash.whash(img)
                
                file_size = image_path.stat().st_size
                width, height = img.size
                total_pixels = width * height
                
                return {
                    'phash': phash,
                    'dhash': dhash,
                    'whash': whash,
                    'size': file_size,
                    'width': width,
                    'height': height,
                    'pixels': total_pixels
                }
        except Exception as e:
            return None
    
    def get_image_resolution(self, image_path: Path) -> Optional[Tuple[int, int, int]]:
        """Get image resolution (width, height, total_pixels)"""
        try:
            with Image.open(image_path) as img:
                width, height = img.size
                total_pixels = width * height
                return (width, height, total_pixels)
        except Exception:
            return None
    
    def find_duplicates(self, image_files: List[Path]) -> Dict[str, Dict]:
        """Find duplicate images using multiple hash algorithms"""
        # Step 1: Find exact duplicates using MD5
        md5_to_files = defaultdict(list)
        for img_path in image_files:
            md5_hash = self.calculate_md5_hash(img_path)
            if md5_hash:
                md5_to_files[md5_hash].append(img_path)
        
        exact_duplicates = {f"exact_{md5}": files for md5, files in md5_to_files.items() if len(files) > 1}
        
        # Step 2: Find similar images using perceptual hashing
        image_hashes = {}
        for img_path in image_files:
            hashes = self.calculate_image_hashes(img_path)
            if hashes:
                image_hashes[img_path] = hashes
        
        similar_groups = []
        processed = set()
        
        for img1_path, hash1 in image_hashes.items():
            if img1_path in processed:
                continue
            
            group = [img1_path]
            processed.add(img1_path)
            
            for img2_path, hash2 in image_hashes.items():
                if img2_path in processed or img1_path == img2_path:
                    continue
                
                phash_diff = hash1['phash'] - hash2['phash']
                dhash_diff = hash1['dhash'] - hash2['dhash']
                whash_diff = hash1['whash'] - hash2['whash']
                
                if (phash_diff <= self.hash_threshold and 
                    dhash_diff <= self.hash_threshold and 
                    whash_diff <= self.hash_threshold) or \
                   (sum([phash_diff <= self.hash_threshold, 
                        dhash_diff <= self.hash_threshold, 
                        whash_diff <= self.hash_threshold]) >= 2):
                    group.append(img2_path)
                    processed.add(img2_path)
            
            if len(group) > 1:
                similar_groups.append(group)
        
        # Combine results with resolution information
        all_duplicates = {}
        group_id = 0
        
        for group_id_str, files in exact_duplicates.items():
            resolutions = {}
            for f in files:
                res = self.get_image_resolution(f)
                if res:
                    resolutions[f] = res
            all_duplicates[f"group_{group_id}"] = {
                'files': files,
                'resolutions': resolutions,
                'type': 'exact'
            }
            group_id += 1
        
        exact_files = set()
        for files in exact_duplicates.values():
            exact_files.update(files)
        
        for group in similar_groups:
            if not any(f in exact_files for f in group):
                resolutions = {}
                for f in group:
                    res = self.get_image_resolution(f)
                    if res:
                        resolutions[f] = res
                all_duplicates[f"group_{group_id}"] = {
                    'files': group,
                    'resolutions': resolutions,
                    'type': 'similar'
                }
                group_id += 1
        
        return all_duplicates
    
    def delete_duplicates(self, duplicates: Dict[str, Dict], 
                         move_to_folder: bool = True,
                         auto_delete_low_res: bool = False) -> List[Path]:
        """Delete duplicate images, prioritizing lower resolution images"""
        deleted_files = []
        duplicates_folder = None
        
        if move_to_folder and self.source_dirs:
            duplicates_folder = self.source_dirs[0] / "_duplicates"
            duplicates_folder.mkdir(exist_ok=True)
        
        low_res_files = []
        
        for group_id, group_data in duplicates.items():
            files = group_data['files']
            resolutions = group_data['resolutions']
            
            files_with_res = []
            for f in files:
                res = resolutions.get(f)
                if res:
                    width, height, pixels = res
                    files_with_res.append((f, width, height, pixels))
                else:
                    files_with_res.append((f, 0, 0, 0))
            
            files_with_res.sort(key=lambda x: (x[3], x[0].stat().st_size if x[0].exists() else 0), reverse=True)
            
            for idx, (file_path, width, height, pixels) in enumerate(files_with_res):
                if idx > 0:  # All except the first (highest resolution)
                    low_res_files.append(file_path)
        
        if not low_res_files:
            return []
        
        for dup_file in low_res_files:
            try:
                if move_to_folder:
                    dest = duplicates_folder / dup_file.name
                    counter = 1
                    while dest.exists():
                        stem = dup_file.stem
                        suffix = dup_file.suffix
                        dest = duplicates_folder / f"{stem}_{counter}{suffix}"
                        counter += 1
                    shutil.move(str(dup_file), str(dest))
                else:
                    dup_file.unlink()
                deleted_files.append(dup_file)
            except Exception as e:
                print(f"Error processing {dup_file}: {e}")
        
        return deleted_files
    
    def detect_faces(self, image_path: Path) -> Tuple[List, Optional[np.ndarray]]:
        """Detect faces in an image using accurate CNN model"""
        try:
            # Load image
            image = face_recognition.load_image_file(str(image_path))
            
            # Get image dimensions for debugging
            img_height, img_width = image.shape[:2]
            
            # Try the selected model first
            face_locations = face_recognition.face_locations(image, model=self.face_model)
            
            # If no faces found and using CNN, try HOG as fallback
            if len(face_locations) == 0 and self.use_cnn:
                face_locations = face_recognition.face_locations(image, model='hog')
            
            # If still no faces, try with upsampling (helps detect smaller faces)
            if len(face_locations) == 0:
                face_locations = face_recognition.face_locations(
                    image, 
                    model='hog', 
                    number_of_times_to_upsample=2
                )
            
            # Log successful detections (first 10 only to avoid spam)
            if len(face_locations) > 0 and hasattr(self, '_detection_count'):
                self._detection_count = getattr(self, '_detection_count', 0) + 1
                if self._detection_count <= 10:
                    print(f"  [FOUND] {len(face_locations)} face(s) in {image_path.name} ({img_width}x{img_height})")
            
            return face_locations, image
        except Exception as e:
            # Check for specific errors
            error_msg = str(e).lower()
            if 'dlib' in error_msg or 'model' in error_msg:
                # Critical error - log it
                safe_msg = str(e).encode('ascii', 'replace').decode('ascii')
                if not hasattr(self, '_error_logged'):
                    print(f"  [ERROR] Face detection error: {safe_msg}")
                    print("  This may indicate dlib model files are missing")
                    self._error_logged = True
            return [], None
    
    def get_face_encoding(self, image: np.ndarray, face_location: Tuple) -> Optional[np.ndarray]:
        """Get face encoding for a detected face"""
        try:
            encodings = face_recognition.face_encodings(image, [face_location])
            return encodings[0] if encodings else None
        except Exception:
            return None
    
    def identify_person(self, face_encoding: np.ndarray, tolerance: float = 0.6) -> Optional[str]:
        """Identify if a face matches a known person"""
        for person_name, known_encoding in self.known_faces.items():
            matches = face_recognition.compare_faces([known_encoding], face_encoding, tolerance=tolerance)
            if matches[0]:
                return person_name
        return None
    
    def process_image(self, image_path: Path) -> str:
        """Process a single image: detect faces and identify persons"""
        try:
            face_locations, image = self.detect_faces(image_path)
            
            if not face_locations or image is None:
                return "Not Detected Persons"
            
            persons_in_image = set()
            
            for idx, face_location in enumerate(face_locations):
                try:
                    face_encoding = self.get_face_encoding(image, face_location)
                    if face_encoding is None:
                        # Silent - encoding failures are common
                        continue
                    
                    person_name = self.identify_person(face_encoding, tolerance=0.5)  # Lower tolerance = stricter matching
                    
                    if person_name is None:
                        # New person found
                        self.person_counter += 1
                        person_name = f"Person_{self.person_counter}"
                        self.known_faces[person_name] = face_encoding
                        print(f"  [NEW] Person {self.person_counter} detected in {image_path.name}")
                    # else:
                    #     print(f"    Matched existing person: {person_name} in {image_path.name}")
                    
                    persons_in_image.add(person_name)
                except Exception as e:
                    # Only print critical errors
                    if "face_recognition" in str(e).lower() or "dlib" in str(e).lower():
                        print(f"  [ERROR] Face processing error in {image_path.name}: {e}")
                    continue
            
            if len(persons_in_image) > 1:
                return "Multiple Persons"
            elif len(persons_in_image) == 1:
                return list(persons_in_image)[0]
            else:
                return "Not Detected Persons"
        except Exception as e:
            # Silent error handling - don't spam console
            # error_msg = str(e).encode('ascii', 'replace').decode('ascii')
            # print(f"Error processing image {image_path.name}: {error_msg}")
            return "Not Detected Persons"
    
    def organize_images(self, image_files: List[Path], progress_callback=None):
        """Organize images into folders based on detected persons"""
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        total = len(image_files)
        processed = 0
        errors = []
        faces_detected = 0
        no_faces_count = 0
        self._detection_count = 0
        self._error_logged = False
        
        print(f"Organizing {total} image(s) by detected persons...")
        print(f"Using {'CNN' if self.use_cnn else 'HOG'} model for face detection")
        print("=" * 60)
        
        # Verify face_recognition is working
        print("\nVerifying face_recognition library...")
        try:
            import dlib
            print("[OK] dlib library found")
        except ImportError:
            print("[ERROR] dlib library not found!")
            print("  Please install: pip install dlib")
            print("  On Windows, you may need Visual Studio Build Tools")
            print("  Continuing anyway - images will go to 'Not Detected Persons'")
            # Don't return early - continue processing anyway
            errors.append('dlib library not installed - face detection cannot work')
        
        try:
            # Test with a simple check
            test_image = np.zeros((100, 100, 3), dtype=np.uint8)
            face_recognition.face_locations(test_image)
            print("[OK] face_recognition library is working")
        except Exception as e:
            error_msg = f"face_recognition test failed: {str(e)[:200]}"
            print(f"[ERROR] {error_msg}")
            print("  Face detection will not work properly")
            print("  Continuing anyway - images will go to 'Not Detected Persons'")
            # Don't return early - continue processing anyway
            errors.append(f'face_recognition library error: {error_msg}')
        
        print("Starting face detection...\n")
        
        for idx, img_path in enumerate(image_files, 1):
            try:
                if progress_callback:
                    progress_callback(idx, total, str(img_path))
                
                if idx % 50 == 0 or idx == 1:
                    print(f"\nProcessing image {idx}/{total}: {img_path.name}")
                    if idx == 1:
                        # Show sample of first image processing
                        print("  (Showing first few detections for debugging)")
                
                # Process image - this should never fail completely
                try:
                    folder_name = self.process_image(img_path)
                except Exception as e:
                    # If process_image fails, put in Not Detected Persons
                    error_msg = f"Error in process_image for {img_path.name}: {str(e)[:100]}"
                    print(f"  [WARNING] {error_msg}")
                    folder_name = "Not Detected Persons"
                    errors.append(error_msg)
                
                # Track statistics
                if folder_name != "Not Detected Persons":
                    faces_detected += 1
                else:
                    no_faces_count += 1
                
                # Create folder and copy file
                try:
                    person_folder = self.output_dir / folder_name
                    person_folder.mkdir(parents=True, exist_ok=True)
                    
                    dest_path = person_folder / img_path.name
                    
                    counter = 1
                    while dest_path.exists():
                        stem = img_path.stem
                        suffix = img_path.suffix
                        dest_path = person_folder / f"{stem}_{counter}{suffix}"
                        counter += 1
                    
                    shutil.copy2(img_path, dest_path)
                    processed += 1
                except Exception as e:
                    # File operation error - still count as processed but log error
                    error_msg = f"Error copying {img_path.name}: {str(e)[:100]}"
                    print(f"  [ERROR] {error_msg}")
                    errors.append(error_msg)
                    # Still count as processed (we tried)
                    processed += 1
                    
            except Exception as e:
                # Catch-all for any unexpected errors
                error_msg = f"Unexpected error processing {img_path.name}: {str(e)[:100]}"
                print(f"  [CRITICAL ERROR] {error_msg}")
                errors.append(error_msg)
                # Still try to continue with next image
                processed += 1  # Count as attempted
                no_faces_count += 1
        
        print("\n" + "=" * 60)
        print(f"Organization complete!")
        print(f"  Total images: {total}")
        print(f"  Processed: {processed}")
        print(f"  Images with faces: {faces_detected}")
        print(f"  Images without faces: {no_faces_count}")
        print(f"  Person folders created: {len(self.known_faces)}")
        print(f"  Output directory: {self.output_dir}")
        if errors:
            print(f"  Errors: {len(errors)}")
        print("=" * 60)
        
        return {
            'processed': processed,
            'total': total,
            'person_folders': len(self.known_faces),
            'faces_detected': faces_detected,
            'no_faces': no_faces_count,
            'errors': errors
        }

