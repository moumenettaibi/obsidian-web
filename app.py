import os
import re
from flask import Flask, render_template, redirect, jsonify, request, send_from_directory, abort, Response
from pathlib import Path
import logging
from datetime import datetime
import requests
from urllib.parse import quote
from api import chat_with_mymind

# Configure logging to show timestamps and log levels in the console output.
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__, template_folder='templates', static_folder='static')

# --- Configuration ---
NOTES_DIRECTORY = '/Volumes/Ohne Titel - Daten/Users/mac/Downloads/Obsidian'
Path(NOTES_DIRECTORY).mkdir(parents=True, exist_ok=True)

# --- Global Variables for Chat ---
allNotes = []

# --- TMDb API Configuration ---
TMDB_API_KEY = 'f2d7ae9dee829174c475e32fe8f993dc'
TMDB_API_BASE_URL = 'https://api.themoviedb.org/3'


# --- Helper Functions ---

def extract_content_without_tags(content):
    """
    Removes markdown tags and formatting to get clean content for search.
    """
    import re
    
    # Remove markdown formatting
    content = re.sub(r'#{1,6}\s+', '', content)  # Headers
    content = re.sub(r'\*\*(.*?)\*\*', r'\1', content)  # Bold
    content = re.sub(r'\*(.*?)\*', r'\1', content)  # Italic
    content = re.sub(r'`(.*?)`', r'\1', content)  # Inline code
    content = re.sub(r'```[\s\S]*?```', '', content)  # Code blocks
    content = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', content)  # Links
    content = re.sub(r'\[\[(.*?)\]\]', r'\1', content)  # Wikilinks
    content = re.sub(r'==(.+?)==', r'\1', content)  # Highlights
    content = re.sub(r'~~(.+?)~~', r'\1', content)  # Strikethrough
    content = re.sub(r'- \[ \]', '', content)  # Unchecked tasks
    content = re.sub(r'- \[x\]', '', content)  # Checked tasks
    content = re.sub(r'^- ', '', content, flags=re.MULTILINE)  # List items
    content = re.sub(r'^\d+\. ', '', content, flags=re.MULTILINE)  # Numbered lists
    content = re.sub(r'---+', '', content)  # Horizontal rules
    
    # Clean up extra whitespace
    content = re.sub(r'\n\s*\n', '\n\n', content)
    content = content.strip()
    
    return content

def extract_tags(content):
    """
    Extracts hashtags from content.
    """
    import re
    tags = re.findall(r'#(\w+)', content)
    return list(set(tags))  # Remove duplicates

def detect_audio_note(content, filename):
    """
    Detects if a note is related to audio/music.
    """
    audio_indicators = [
        'spotify.com', 'soundcloud.com', 'youtube.com/watch',
        'apple.com/music', 'music.amazon.com', 'bandcamp.com',
        'podcast', 'song', 'album', 'artist', 'track', 'playlist'
    ]
    
    content_lower = content.lower()
    filename_lower = filename.lower()
    
    # Check content for audio indicators
    for indicator in audio_indicators:
        if indicator in content_lower:
            return True
    
    # Check filename for audio extensions or keywords
    audio_keywords = ['music', 'song', 'album', 'podcast', 'audio']
    for keyword in audio_keywords:
        if keyword in filename_lower:
            return True
    
    return False

def search_tmdb_by_title(media_type, title):
    """
    Searches TMDb for a movie or TV show by its title and returns the ID of the first result.
    """
    if not all([media_type, title, TMDB_API_KEY]):
        return None
    
    encoded_title = quote(title)
    url = f"{TMDB_API_BASE_URL}/search/{media_type}?api_key={TMDB_API_KEY}&query={encoded_title}"
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        results = response.json().get('results', [])
        if results:
            tmdb_id = results[0].get('id')
            logging.info(f"TMDb search for '{title}' found ID: {tmdb_id}")
            return tmdb_id
        else:
            logging.warning(f"TMDb search for '{title}' returned no results.")
            return None
    except requests.exceptions.RequestException as e:
        logging.error(f"Error searching TMDb for title '{title}': {e}")
        return None

def fetch_tmdb_data(media_type, tmdb_id):
    """
    Fetches detailed data for a movie or TV show from the TMDb API using its ID.
    """
    if not all([media_type, tmdb_id, TMDB_API_KEY]):
        return None
        
    url = f"{TMDB_API_BASE_URL}/{media_type}/{tmdb_id}?api_key={TMDB_API_KEY}&append_to_response=content_ratings,genres"
    try:
        response = requests.get(url)
        response.raise_for_status()
        logging.info(f"Successfully fetched TMDb data for {media_type} ID: {tmdb_id}")
        return response.json()
    except requests.exceptions.RequestException as e:
        logging.error(f"Error fetching TMDb data for {media_type} ID {tmdb_id}: {e}")
        return None

def get_notes_from_disk(root_path):
    """
    Recursively scans the directory for notes and all other media files.
    """
    all_notes = []
    top_level_folders = set()
    # Use a single dictionary to hold all non-markdown files.
    # The key is the filename (e.g., "my-video.mp4"), value is the full relative path.
    media_files = {}
    root_path_obj = Path(root_path)

    if not root_path_obj.is_dir():
        logging.error(f"Notes directory not found at: {root_path}")
        return [], [], {}

    letterboxd_pattern = re.compile(r'https?://letterboxd\.com/film/([^/]+)/?')
    serializd_pattern = re.compile(r'https?://www\.serializd\.com/show/([^/]+)/?')
    wikipedia_pattern = re.compile(r'[a-z]{2}\.wikipedia\.org/wiki/([^/\s]+)')
    reddit_pattern = re.compile(r'https?://(?:www\.)?reddit\.com/r/[^\s]+/comments/[^\s]+/[^\s]+/?')
    x_pattern = re.compile(r'https?://(?:www\.)?(?:x\.com|twitter\.com)/[a-zA-Z0-9_]+/status/[^\s]+/?')

    logging.info(f"Scanning for notes and media in: {root_path}")
    for dirpath, dirnames, filenames in os.walk(root_path, topdown=True):
        dirnames[:] = [d for d in dirnames if not d.startswith('.')]
        dirpath_obj = Path(dirpath)

        if dirpath_obj == root_path_obj:
            top_level_folders.update(dirnames)

        for filename in filenames:
            if filename.startswith('.'):
                continue
            
            entry = dirpath_obj / filename
            try:
                rel_path = str(entry.relative_to(root_path_obj))
                file_suffix_lower = entry.suffix.lower()

                if file_suffix_lower == '.md':
                    # This is a note, process it as before.
                    raw_content = entry.read_text(encoding='utf-8')
                    file_stat = entry.stat()
                    
                    # Parse YAML frontmatter
                    frontmatter = {}
                    content_body = raw_content
                    tags_from_frontmatter = []
                    if raw_content.strip().startswith('---'):
                        lines = raw_content.split('\n')
                        end_index = lines.index('---', 1) if '---' in lines[1:] else -1
                        if end_index > 1:
                            yaml_block = '\n'.join(lines[1:end_index])
                            try:
                                import yaml
                                frontmatter = yaml.safe_load(yaml_block) or {}
                                content_body = '\n'.join(lines[end_index+1:]).strip()
                                if isinstance(frontmatter.get('tags'), list):
                                    tags_from_frontmatter = frontmatter.get('tags', [])
                            except ImportError:
                                pass  # yaml not installed
                            except yaml.YAMLError:
                                pass  # invalid yaml
                    
                    # Use content_body as the main content, but keep raw_content for now
                    content_without_tags = extract_content_without_tags(content_body)
                    all_tags = extract_tags(content_body)
                    if tags_from_frontmatter:
                        all_tags.extend(tags_from_frontmatter)
                        all_tags = list(set(all_tags))  # dedup
                    
                    sort_time = getattr(file_stat, 'st_birthtime', file_stat.st_mtime)
                    human_readable_time = datetime.fromtimestamp(sort_time).strftime('%Y-%m-%d %H:%M:%S')
                    
                    wikilink_pattern = re.compile(r'\[\[(.*?)\]\]')
                    links = [match.group(1) for match in wikilink_pattern.finditer(raw_content)]

                    # Enhanced content processing
                    content_without_tags = extract_content_without_tags(raw_content)
                    tags = extract_tags(raw_content)
                    is_audio_note = detect_audio_note(raw_content, entry.name)
                    
                    is_book_note = frontmatter.get('category') == 'Books'
                    book_data = frontmatter if is_book_note else {}
                    
                    note_data = {
                        "id": rel_path, "path": rel_path, "name": entry.name,
                        "rawContent": raw_content, "contentWithoutTags": content_without_tags,
                        "lastModified": file_stat.st_mtime * 1000,
                        "createdTime": sort_time * 1000, "createdTimeReadable": human_readable_time,
                        "links": links, "tags": all_tags, "isMediaNote": False, "isRedditNote": False, "isAudioNote": is_audio_note,
                        "isBookNote": is_book_note, "bookData": book_data,
                        "tmdb_data": None, "media_type": None, "title_slug": None, "redditUrl": None,
                        "isXNote": False, "xUrl": None
                    }

                    letterboxd_match = letterboxd_pattern.search(raw_content)
                    serializd_match = serializd_pattern.search(raw_content)
                    wikipedia_match = wikipedia_pattern.search(raw_content)

                    if letterboxd_match:
                        note_data.update({'isMediaNote': True, 'media_type': 'movie', 'title_slug': letterboxd_match.group(1)})
                    elif serializd_match:
                        slug_with_id = serializd_match.group(1)
                        title_slug = re.sub(r'-\d+$', '', slug_with_id)
                        note_data.update({'isMediaNote': True, 'media_type': 'tv', 'title_slug': title_slug})
                    elif wikipedia_match:
                        title_slug = wikipedia_match.group(1).replace('_', ' ')
                        note_data.update({'isMediaNote': True, 'media_type': 'wikipedia', 'title_slug': title_slug})
                    reddit_matches = reddit_pattern.findall(raw_content)
                    if reddit_matches and not note_data.get('isMediaNote', False) and not note_data.get('isBookNote', False):
                        last_url = reddit_matches[-1].rstrip(')/')
                        note_data.update({'isRedditNote': True, 'redditUrl': last_url})

                    x_matches = x_pattern.findall(raw_content)
                    if x_matches and not note_data.get('isMediaNote', False) and not note_data.get('isBookNote', False):
                        last_url = x_matches[-1].rstrip(')/')
                        note_data.update({'isXNote': True, 'xUrl': last_url})

                    all_notes.append(note_data)
                else:
                    # If it's not a markdown file, treat it as a media file.
                    # This is simpler and handles any file type automatically.
                    media_files[filename] = rel_path

            except Exception as e:
                logging.error(f"Error processing file {entry}: {e}")
            
    return all_notes, sorted(list(top_level_folders)), media_files

# --- API Routes ---
@app.route("/api/status")
def api_status():
    """Returns the current notes directory."""
    return jsonify({"notes_directory": NOTES_DIRECTORY})

@app.route("/api/notes")
def api_get_notes():
    """API endpoint to get all notes and a map of all available media files."""
    global fuse, allNotes
    
    logging.info("API endpoint /api/notes hit. Fetching notes and media files.")
    notes, folders, media_files = get_notes_from_disk(NOTES_DIRECTORY)
    
    notes.sort(key=lambda x: x['createdTime'], reverse=True)
    logging.info("Notes have been sorted by 'createdTime' in descending (new to old) order.")
    
    # Update global variables for chat functionality
    allNotes = notes
    
    return jsonify({"notes": notes, "folders": folders, "media_files": media_files})

@app.route("/api/tmdb_details")
def api_tmdb_details():
    """
    Fetches TMDb data for a single media item based on type and title slug.
    This is called by the frontend after the initial notes have loaded.
    """
    media_type = request.args.get('type')
    title_slug = request.args.get('slug')
    logging.info(f"Received TMDb detail request for type='{media_type}', slug='{title_slug}'")

    if not media_type or not title_slug:
        return jsonify({"error": "Missing type or slug parameter"}), 400

    search_title = title_slug.replace('-', ' ')
    tmdb_id = search_tmdb_by_title(media_type, search_title)
    
    if tmdb_id:
        tmdb_info = fetch_tmdb_data(media_type, tmdb_id)
        if tmdb_info:
            return jsonify(tmdb_info)
    
    logging.warning(f"Could not find or fetch TMDb data for slug '{title_slug}'")
    return jsonify({"error": "Media not found on TMDb"}), 404

@app.route("/api/wikipedia_details")
def api_wikipedia_details():
    """
    Fetches Wikipedia data for a single article based on title slug.
    This is called by the frontend after the initial notes have loaded.
    """
    title_slug = request.args.get('slug')
    logging.info(f"Received Wikipedia detail request for slug='{title_slug}'")

    if not title_slug:
        return jsonify({"error": "Missing slug parameter"}), 400

    try:
        import wikipedia
        wikipedia.set_lang('en')
        
        # Search for the article
        search_results = wikipedia.search(title_slug, results=1)
        if not search_results:
            logging.warning(f"Could not find Wikipedia article for slug '{title_slug}'")
            return jsonify({"error": "Wikipedia article not found"}), 404
        
        # Get the page
        page = wikipedia.page(search_results[0])
        
        # Get summary
        summary = wikipedia.summary(search_results[0], sentences=3)
        
        # Get featured image if available
        featured_image = None
        try:
            # Try to get the first image from the page
            images = page.images
            for img in images:
                if any(ext in img.lower() for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']):
                    featured_image = img
                    break
        except Exception as e:
            logging.warning(f"Could not fetch images for Wikipedia article '{title_slug}': {e}")
        
        wikipedia_data = {
            'title': page.title,
            'summary': summary,
            'url': page.url,
            'featured_image': featured_image,
            'categories': page.categories[:5] if page.categories else [],  # Limit to first 5 categories
            'page_id': page.pageid
        }
        
        logging.info(f"Successfully fetched Wikipedia data for '{title_slug}'")
        return jsonify(wikipedia_data)
        
    except wikipedia.exceptions.DisambiguationError as e:
        # Handle disambiguation pages
        logging.warning(f"Wikipedia disambiguation for '{title_slug}': {e}")
        return jsonify({"error": "Wikipedia disambiguation page"}), 404
    except wikipedia.exceptions.PageError as e:
        logging.warning(f"Wikipedia page not found for '{title_slug}': {e}")
        return jsonify({"error": "Wikipedia page not found"}), 404
    except Exception as e:
        logging.error(f"Error fetching Wikipedia data for '{title_slug}': {e}")
        return jsonify({"error": "Failed to fetch Wikipedia data"}), 500

@app.route("/api/media/<path:filepath>")
def serve_media(filepath):
    """Serves any file from the notes directory."""
    try:
        notes_dir = Path(NOTES_DIRECTORY).resolve()
        safe_path = notes_dir.joinpath(filepath).resolve()
        
        # Security check: Ensure the resolved path is within the notes directory
        if notes_dir in safe_path.parents or notes_dir == safe_path.parent:
             return send_from_directory(safe_path.parent, safe_path.name)
        else:
            abort(404, "File not found due to security constraints")
    except FileNotFoundError:
        abort(404, "File not found")

@app.route("/api/note", methods=['POST', 'PUT', 'DELETE'])
def handle_note():
    """Handles creating, updating, and deleting notes."""
    logging.info(f"API endpoint /api/note hit with method: {request.method}")
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid request"}), 400

    if request.method == 'POST':
        path = data.get('path')
        content = data.get('content', '')
        if not path:
            return jsonify({"error": "Path is required"}), 400
        
        try:
            full_path = Path(NOTES_DIRECTORY).joinpath(path).resolve()
            if Path(NOTES_DIRECTORY).resolve() not in full_path.parents:
                 return jsonify({"error": "Invalid path"}), 400

            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content, encoding='utf-8')
            logging.info(f"Note created successfully at: {path}")
            return jsonify({"message": "Note created successfully"}), 201
        except Exception as e:
            logging.error(f"Error creating note: {e}")
            return jsonify({"error": str(e)}), 500

    if request.method == 'PUT':
        old_path_str = data.get('old_path')
        new_path_str = data.get('new_path')
        content = data.get('content')

        if not old_path_str or not new_path_str or content is None:
            return jsonify({"error": "Missing parameters"}), 400
        
        try:
            old_path = Path(NOTES_DIRECTORY).joinpath(old_path_str).resolve()
            new_path = Path(NOTES_DIRECTORY).joinpath(new_path_str).resolve()

            if Path(NOTES_DIRECTORY).resolve() not in old_path.parents or \
               Path(NOTES_DIRECTORY).resolve() not in new_path.parents:
                return jsonify({"error": "Invalid path"}), 400

            if old_path != new_path:
                new_path.parent.mkdir(parents=True, exist_ok=True)
                old_path.rename(new_path)
            
            new_path.write_text(content, encoding='utf-8')
            logging.info(f"Note updated from '{old_path_str}' to '{new_path_str}'")
            return jsonify({"message": "Note updated successfully"})

        except Exception as e:
            logging.error(f"Error updating note: {e}")
            return jsonify({"error": str(e)}), 500

    if request.method == 'DELETE':
        path_str = data.get('path')
        if not path_str:
            return jsonify({"error": "Path is required"}), 400
        
        try:
            file_path = Path(NOTES_DIRECTORY).joinpath(path_str).resolve()
            if Path(NOTES_DIRECTORY).resolve() not in file_path.parents:
                 return jsonify({"error": "Invalid path"}), 400

            if file_path.exists():
                file_path.unlink()
                logging.info(f"Note deleted: {path_str}")
                return jsonify({"message": "Note deleted successfully"})
            else:
                return jsonify({"error": "File not found"}), 404
        except Exception as e:
            logging.error(f"Error deleting note: {e}")
            return jsonify({"error": str(e)}), 500
            
    return jsonify({"error": "Unsupported method"}), 405

def extract_search_terms(query):
    """
    Intelligently extract key search terms from natural language queries.
    """
    import re
    
    query_lower = query.lower().strip()
    
    # Common stop words and phrases to ignore
    stop_words = {
        'find', 'search', 'look', 'for', 'about', 'tell', 'me', 'what', 'do', 'you', 'know',
        'show', 'get', 'give', 'information', 'details', 'on', 'my', 'notes', 'vault', 'in',
        'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'have', 'has',
        'had', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'shall',
        'this', 'that', 'these', 'those', 'i', 'we', 'they', 'he', 'she', 'it', 'from',
        'to', 'with', 'by', 'at', 'of', 'as', 'like', 'than', 'so', 'if', 'when', 'where',
        'how', 'why', 'who', 'which', 'what', 'please', 'help', 'any', 'some', 'all'
    }
    
    # Remove common question patterns and extract meaningful terms
    patterns_to_remove = [
        r'\b(find|search|look)\s+(for|about)\b',
        r'\b(tell|show|give)\s+me\s+(about)?\b',
        r'\b(what|how)\s+(do\s+you\s+know\s+about|about)\b',
        r'\b(in\s+my\s+)(notes|vault|obsidian|files)\b',
        r'\b(on\s+my\s+)(notes|vault|obsidian|files)\b',
        r'\b(from\s+my\s+)(notes|vault|obsidian|files)\b'
    ]
    
    cleaned_query = query_lower
    for pattern in patterns_to_remove:
        cleaned_query = re.sub(pattern, ' ', cleaned_query)
    
    # Split into words and filter out stop words
    words = re.findall(r'\b\w+\b', cleaned_query)
    meaningful_words = [word for word in words if word not in stop_words and len(word) > 2]
    
    # If no meaningful words found, fall back to original query words
    if not meaningful_words:
        meaningful_words = [word for word in re.findall(r'\b\w+\b', query_lower) if len(word) > 2]
    
    return meaningful_words

def enhanced_search_for_chat(query, notes, max_results=8, date_filter=None):
    """
    Enhanced search function with temporal awareness and better intent understanding.
    If date_filter is provided (e.g., {'type': 'today'}), filters notes to that date first.
    """
    if not notes:
        return []
    
    query_lower = query.lower().strip()
    if not query_lower:
        return []
    
    # Apply date filter first if specified
    if date_filter and date_filter.get('type'):
        from datetime import datetime, date, timedelta
        filter_type = date_filter.get('type')
        now = datetime.now()
        
        if filter_type == 'today':
            today = date.today()
            notes = [note for note in notes if note.get('createdTime') and
                     datetime.fromtimestamp(note['createdTime'] / 1000).date() == today]
        elif filter_type == 'yesterday':
            yesterday = now.date() - timedelta(days=1)
            notes = [note for note in notes if note.get('createdTime') and
                     datetime.fromtimestamp(note['createdTime'] / 1000).date() == yesterday]
        elif filter_type == 'this_week':
            week_start = now - timedelta(days=now.weekday())
            notes = [note for note in notes if note.get('createdTime') and
                     datetime.fromtimestamp(note['createdTime'] / 1000) >= week_start]
    
    # Check for temporal queries
    temporal_keywords = {
        'latest': lambda notes: sorted(notes, key=lambda x: x.get('createdTime', 0), reverse=True),
        'last': lambda notes: sorted(notes, key=lambda x: x.get('createdTime', 0), reverse=True),
        'recent': lambda notes: sorted(notes, key=lambda x: x.get('createdTime', 0), reverse=True),
        'newest': lambda notes: sorted(notes, key=lambda x: x.get('createdTime', 0), reverse=True),
        'oldest': lambda notes: sorted(notes, key=lambda x: x.get('createdTime', 0)),
        'first': lambda notes: sorted(notes, key=lambda x: x.get('createdTime', 0))
    }
    
    # Check if this is a temporal query
    is_temporal = any(keyword in query_lower for keyword in temporal_keywords.keys())
    
    if is_temporal:
        # Handle temporal queries specially, pass date_filter
        from api import analyze_user_intent
        intent = analyze_user_intent(query)
        date_filter = intent.get('date_filter')
        return handle_temporal_query(query, query_lower, notes, temporal_keywords, max_results, date_filter)
    
    # Extract meaningful search terms from the query
    search_terms = extract_search_terms(query)
    logging.info(f"Extracted search terms from '{query}': {search_terms}")
    
    # Advanced search with multiple strategies
    scored_notes = []
    
    for note in notes:
        score = 0
        
        # Get searchable content
        raw_content = note.get('rawContent', '')
        content_without_tags = note.get('contentWithoutTags', '')
        path = note.get('path', '')
        tags = note.get('tags', [])
        
        # Search in different fields with different weights
        searchable_fields = [
            (raw_content.lower(), 10),           # Raw content
            (content_without_tags.lower(), 12),  # Content without tags (slightly higher)
            (path.lower(), 25),                  # File path (high importance)
            (' '.join(tags).lower(), 15)        # Tags
        ]
        
        # Check for exact phrase match first (highest priority) - use original query
        for field_content, weight in searchable_fields:
            if query_lower in field_content:
                score += weight * 15  # Higher boost for exact phrase matches
        
        # Check extracted meaningful terms (main search logic)
        for term in search_terms:
            if len(term) < 2:
                continue
                
            for field_content, weight in searchable_fields:
                # Count occurrences of the term
                term_count = field_content.count(term)
                if term_count > 0:
                    # Higher score for more occurrences
                    score += term_count * weight * 2
                    
                    # Extra boost if term appears in title/filename
                    filename = path.split('/')[-1].lower() if '/' in path else path.lower()
                    if term in filename:
                        score += 100  # Very high boost for filename matches
        
        # Fallback: also check original query words if no meaningful terms found good matches
        if score == 0:
            query_words = query_lower.split()
            for word in query_words:
                if len(word) > 2:
                    for field_content, weight in searchable_fields:
                        word_count = field_content.count(word)
                        score += word_count * weight
        
        # Add note if it has any relevance
        if score > 0:
            scored_notes.append((score, note))
    
    # Sort by relevance and take top results
    scored_notes.sort(key=lambda x: x[0], reverse=True)
    
    # Prepare context for AI
    return prepare_context_notes(scored_notes, max_results)

def handle_temporal_query(query, query_lower, notes, temporal_keywords, max_results, date_filter=None):
    """
    Handles temporal queries like 'latest movie', 'last book I added', etc.
    If date_filter is provided, prioritizes date filtering over content type.
    """
    # Determine the temporal sorting
    sort_func = None
    for keyword, func in temporal_keywords.items():
        if keyword in query_lower:
            sort_func = func
            break
    
    if not sort_func:
        sort_func = temporal_keywords['latest']  # Default to latest
    
    # Sort notes by time
    sorted_notes = sort_func(notes)
    
    # If date_filter is specified, use only those notes (prioritize over content type)
    if date_filter and date_filter.get('type') == 'today':
        from datetime import datetime, date
        today = date.today()
        sorted_notes = [note for note in sorted_notes if note.get('createdTime') and
                        datetime.fromtimestamp(note['createdTime'] / 1000).date() == today]
        # For today filter, use all today's notes without further content filtering
        filtered_notes = sorted_notes[:max_results * 2]
    else:
        # Extract content type from query (original logic)
        content_types = {
            'movie': lambda n: n.get('media_type') == 'movie',
            'film': lambda n: n.get('media_type') == 'movie',
            'show': lambda n: n.get('media_type') == 'tv',
            'tv': lambda n: n.get('media_type') == 'tv',
            'series': lambda n: n.get('media_type') == 'tv',
            'book': lambda n: 'book' in n.get('rawContent', '').lower() or 'goodreads' in n.get('rawContent', '').lower(),
            'audio': lambda n: n.get('isAudioNote', False),
            'music': lambda n: n.get('isAudioNote', False),
            'note': lambda n: not n.get('isMediaNote', False) and not n.get('isAudioNote', False),
            'clip': lambda n: 'clip' in n.get('path', '').lower() or 'clipped' in n.get('rawContent', '').lower()
        }
        
        # Filter by content type if specified
        filtered_notes = sorted_notes
        for content_type, filter_func in content_types.items():
            if content_type in query_lower:
                filtered_notes = [note for note in sorted_notes if filter_func(note)]
                break
        
        # If no specific type found, but it's a temporal query, return recent notes
        if not filtered_notes or len(filtered_notes) == len(sorted_notes):
            filtered_notes = sorted_notes[:max_results * 2]  # Get more for temporal queries
    
    # Score based on temporal relevance and content match
    scored_notes = []
    for i, note in enumerate(filtered_notes[:max_results * 3]):  # Consider more notes for temporal queries
        # Higher score for more recent notes (if latest/recent) or older notes (if oldest/first)
        temporal_score = max_results * 3 - i
        
        # Add content relevance score
        content_score = 0
        search_terms = extract_search_terms(query)
        for term in search_terms:
            if term in note.get('rawContent', '').lower():
                content_score += 10
            if term in note.get('path', '').lower():
                content_score += 20
        
        total_score = temporal_score * 10 + content_score
        scored_notes.append((total_score, note))
    
    # Sort by combined score and take top results
    scored_notes.sort(key=lambda x: x[0], reverse=True)
    
    return prepare_context_notes(scored_notes, max_results)

def prepare_context_notes(scored_notes, max_results):
    """
    Prepares context notes for the AI with all necessary metadata.
    """
    context_notes = []
    for score, note in scored_notes[:max_results]:
        # Use the best available content
        content = note.get('contentWithoutTags') or note.get('rawContent', '')
        
        context_note = {
            'path': note['path'],
            'content': content,
            'tags': note.get('tags', []),
            'media_type': note.get('media_type'),
            'is_media_note': note.get('isMediaNote', False),
            'is_audio_note': note.get('isAudioNote', False),
            'score': score,
            'createdTime': note.get('createdTime'),
            'createdTimeReadable': note.get('createdTimeReadable')
        }
        
        context_notes.append(context_note)
    
    return context_notes

@app.route("/api/chat")
def api_chat():
    """
    Handles chat requests with streaming responses.
    """
    global allNotes
    
    question = request.args.get('question', '').strip()
    if not question:
        return jsonify({"error": "Question is required"}), 400

    logging.info(f"Chat request received: {question}")

    def generate_response():
        global allNotes
        import json
        try:
            print(f"DEBUG - Starting chat generation for question: '{question}'")
            # Ensure we have fresh notes data
            if not allNotes:
                notes, folders, media_files = get_notes_from_disk(NOTES_DIRECTORY)
                allNotes = notes
                print(f"DEBUG - Loaded {len(allNotes)} notes for chat")
            
            # Analyze intent to get date_filter
            from api import analyze_user_intent
            intent = analyze_user_intent(question)
            date_filter = intent.get('date_filter')
            print(f"DEBUG - Intent: {intent}")
            print(f"DEBUG - Date filter: {date_filter}")
            
            # Use enhanced search to find relevant notes, pass date_filter
            context_notes = enhanced_search_for_chat(question, allNotes, date_filter=date_filter)
            print(f"DEBUG - Found {len(context_notes)} relevant notes")
            
            print("DEBUG - Calling chat_with_mymind")
            # Generate response using the enhanced chat function from api.py
            for chunk in chat_with_mymind(question, context_notes if context_notes else None, allNotes):
                if 'token' in chunk:
                    yield f"data: {json.dumps({'token': chunk['token']})}\n\n"
                elif 'sources' in chunk:
                    yield f"data: {json.dumps({'sources': chunk['sources']})}\n\n"
                elif 'error' in chunk:
                    yield f"data: {json.dumps({'error': chunk['error']})}\n\n"
                    break

            yield f"data: {json.dumps({'done': True})}\n\n"

        except Exception as e:
            import traceback
            error_msg = f"Error in chat endpoint: {e}"
            full_trace = traceback.format_exc()
            print(f"DEBUG - {error_msg}")
            print(f"DEBUG - Full traceback:\n{full_trace}")
            logging.error(error_msg)
            logging.error(full_trace)
            yield f"data: {json.dumps({'error': 'Sorry, I encountered an error processing your request.'})}\n\n"

    return Response(
        generate_response(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        }
    )


# --- Frontend Routes ---
@app.route("/")
def index():
    return redirect("/everything")

@app.route("/everything")
def home():
    return render_template("index.html")


if __name__ == "__main__":
    logging.info(f"Serving notes from: {NOTES_DIRECTORY}")
    app.run(host="0.0.0.0", port=6769, debug=True)