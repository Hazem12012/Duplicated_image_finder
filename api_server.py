#!/usr/bin/env python3
"""
Flask API Server for Duplicate Image Finder
Exposes the Python backend functionality via REST API
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import sys
import logging
from pathlib import Path
import json

# Suppress Flask startup messages
logging.getLogger('werkzeug').setLevel(logging.WARNING)

# Import the ImageProcessor class
from image_processor import ImageProcessor

app = Flask(__name__)
CORS(app)  # Enable CORS for Electron app

# Suppress Flask development server warning
try:
    cli = sys.modules.get('flask.cli')
    if cli:
        cli.show_server_banner = lambda *args: None
except:
    pass

# Global processor instance
processor = None

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'Python API server is running'})

@app.route('/api/find-duplicates', methods=['POST'])
def find_duplicates():
    """Find duplicate images"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        source_dirs = data.get('source_dirs', [])
        hash_threshold = data.get('hash_threshold', 5)
        use_cnn = data.get('use_cnn', True)
        output_dir = data.get('output_dir', 'organized_images')
        
        if not source_dirs:
            return jsonify({'error': 'No source directories provided'}), 400
        
        print(f"Finding duplicates in {len(source_dirs)} folder(s)...")
        
        # Create processor
        global processor
        processor = ImageProcessor(
            source_dirs=source_dirs,
            output_dir=output_dir,
            hash_threshold=hash_threshold,
            use_cnn=use_cnn
        )
        
        # Get image files
        image_files = processor.get_image_files()
        print(f"Found {len(image_files)} image file(s)")
        
        if len(image_files) == 0:
            return jsonify({
                'total_images': 0,
                'duplicate_groups': 0,
                'duplicates_found': 0,
                'duplicates': {},
                'space_saved': 0
            })
        
        # Find duplicates
        print("Scanning for duplicates...")
        duplicates = processor.find_duplicates(image_files)
        print(f"Found {len(duplicates)} duplicate group(s)")
        
        # Convert to JSON-serializable format
        result = {
            'total_images': len(image_files),
            'duplicate_groups': len(duplicates),
            'duplicates_found': sum(len(group['files']) - 1 for group in duplicates.values()),
            'duplicates': {},
            'space_saved': 0  # Will be calculated if needed
        }
        
        total_space = 0
        for group_id, group_data in duplicates.items():
            files = group_data['files']
            resolutions = group_data['resolutions']
            
            # Sort files by resolution to identify which to delete
            files_with_res = []
            for f in files:
                res = resolutions.get(f, (0, 0, 0))
                file_size = f.stat().st_size if f.exists() else 0
                files_with_res.append((f, res, file_size))
            
            # Sort by resolution (highest first)
            files_with_res.sort(key=lambda x: (x[1][2] if isinstance(x[1], tuple) else 0, x[2]), reverse=True)
            
            # Calculate space that would be saved (all except highest resolution)
            for idx, (f, res, size) in enumerate(files_with_res):
                if idx > 0:  # All except the first
                    total_space += size
            
            result['duplicates'][group_id] = {
                'files': [str(f) for f in files],
                'resolutions': {
                    str(f): list(res) if isinstance(res, tuple) else [0, 0, 0]
                    for f, res in resolutions.items()
                },
                'type': group_data.get('type', 'unknown')
            }
        
        result['space_saved'] = total_space
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete-duplicates', methods=['POST'])
def delete_duplicates():
    """Delete duplicate images"""
    try:
        data = request.json
        duplicates_data = data.get('duplicates', {})
        move_duplicates = data.get('move_duplicates', True)
        auto_delete_low_res = data.get('auto_delete_low_res', False)
        
        if not processor:
            return jsonify({'error': 'No scan performed yet'}), 400
        
        # Convert back to processor format
        duplicates = {}
        for group_id, group_data in duplicates_data.items():
            duplicates[group_id] = {
                'files': [Path(f) for f in group_data['files']],
                'resolutions': {
                    Path(f): tuple(res) if isinstance(res, list) else res
                    for f, res in group_data['resolutions'].items()
                },
                'type': group_data.get('type', 'unknown')
            }
        
        # Delete duplicates
        deleted = processor.delete_duplicates(
            duplicates,
            move_to_folder=move_duplicates,
            auto_delete_low_res=auto_delete_low_res
        )
        
        return jsonify({
            'action': 'moved' if move_duplicates else 'deleted',
            'count': len(deleted),
            'files': [str(f) for f in deleted]
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/organize-by-person', methods=['POST'])
def organize_by_person():
    """Organize images by detected persons"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        source_dirs = data.get('source_dirs', [])
        use_cnn = data.get('use_cnn', True)
        output_dir = data.get('output_dir', 'organized_images')
        
        if not source_dirs:
            return jsonify({'error': 'No source directories provided'}), 400
        
        print(f"Organizing images by person from {len(source_dirs)} folder(s)...")
        
        # Create processor
        global processor
        processor = ImageProcessor(
            source_dirs=source_dirs,
            output_dir=output_dir,
            use_cnn=use_cnn
        )
        
        # Get image files
        image_files = processor.get_image_files()
        print(f"Found {len(image_files)} image file(s)")
        
        if len(image_files) == 0:
            return jsonify({
                'images_processed': 0,
                'total_images': 0,
                'person_folders': 0,
                'output_dir': str(processor.output_dir),
                'errors': []
            })
        
        # Organize images
        try:
            result = processor.organize_images(image_files)
            
            # Ensure we have valid result
            if not result or 'processed' not in result:
                print("ERROR: organize_images returned invalid result")
                return jsonify({
                    'error': 'Processing failed - invalid result returned',
                    'images_processed': 0,
                    'total_images': len(image_files),
                    'person_folders': 0,
                    'faces_detected': 0,
                    'no_faces': len(image_files),
                    'output_dir': str(processor.output_dir),
                    'errors': ['Processing function returned invalid result']
                }), 500
            
            return jsonify({
                'images_processed': result.get('processed', 0),
                'total_images': result.get('total', len(image_files)),
                'person_folders': result.get('person_folders', 0),
                'faces_detected': result.get('faces_detected', 0),
                'no_faces': result.get('no_faces', 0),
                'output_dir': str(processor.output_dir),
                'errors': result.get('errors', [])
            })
        except Exception as e:
            print(f"ERROR in organize_images call: {e}")
            import traceback
            traceback.print_exc()
            return jsonify({
                'error': f'Processing failed: {str(e)[:200]}',
                'images_processed': 0,
                'total_images': len(image_files),
                'person_folders': 0,
                'faces_detected': 0,
                'no_faces': len(image_files),
                'output_dir': str(processor.output_dir),
                'errors': [str(e)]
            }), 500
        
    except Exception as e:
        import traceback
        import sys
        import io
        
        # Capture traceback safely for Windows console
        error_buffer = io.StringIO()
        traceback.print_exc(file=error_buffer)
        error_details = error_buffer.getvalue()
        
        # Print error safely (avoid Unicode issues on Windows)
        try:
            print(f"Error in organize_by_person: {e}")
            print(error_details)
        except UnicodeEncodeError:
            # Fallback for Windows console encoding issues
            print(f"Error in organize_by_person: {str(e).encode('ascii', 'replace').decode('ascii')}")
            print(error_details.encode('ascii', 'replace').decode('ascii'))
        
        # Return error without Unicode characters
        safe_error = str(e).encode('ascii', 'replace').decode('ascii')
        return jsonify({'error': safe_error}), 500

if __name__ == '__main__':
    import logging
    import warnings
    
    # Suppress all Flask/Werkzeug warnings and info messages
    logging.getLogger('werkzeug').setLevel(logging.ERROR)
    logging.getLogger('flask').setLevel(logging.ERROR)
    
    # Suppress all warnings including Flask development server warning
    warnings.filterwarnings('ignore')
    
    # Suppress Flask CLI banner
    import os
    os.environ['FLASK_ENV'] = 'production'  # This helps suppress some warnings
    
    print("=" * 60)
    print("Python API Server")
    print("=" * 60)
    print("Server: http://127.0.0.1:5000")
    print("Status: Ready")
    print("=" * 60)
    print()
    
    try:
        # Run server silently
        app.run(
            host='127.0.0.1', 
            port=5000, 
            debug=False, 
            use_reloader=False,
            threaded=True
        )
    except KeyboardInterrupt:
        print("\n\nServer shutting down...")
    except Exception as e:
        print(f"\nError: {e}")

