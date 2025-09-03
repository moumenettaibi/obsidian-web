import requests
import re
import json
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

# Configure the Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-1.5-flash')


def extract_book_title_from_url(url):
    """
    Extracts the book title from a Goodreads URL.
    Example URL: https://www.goodreads.com/book/show/1303.The_48_Laws_of_Power?from_search=true
    """
    match = re.search(r"book/show/\d+\.([^.?#]+)", url)
    if match:
        # Replace underscores with spaces for a cleaner title
        title = match.group(1).replace("_", " ")
        return title
    return None


def get_book_data(title):
    """
    Fetches book data from the Google Books API using a title.
    """
    if not title:
        return None

    # Prepare the title for the API query
    query = title.replace(" ", "+")
    url = f"https://www.googleapis.com/books/v1/volumes?q={query}"

    try:
        response = requests.get(url)
        # Raise an exception for bad status codes (4xx or 5xx)
        response.raise_for_status()
        data = response.json()

        if 'items' in data and data['items']:
            # Get the first and most relevant result
            book_info = data['items'][0]['volumeInfo']
            
            # Safely get all the required fields with defaults
            title = book_info.get('title', 'No title available')
            authors = book_info.get('authors', [])
            published_date = book_info.get('publishedDate', 'N/A')
            description = book_info.get('description', 'No description available.')
            page_count = book_info.get('pageCount', 'N/A')
            
            image_links = book_info.get('imageLinks', {})
            # Get a high-quality thumbnail if available, otherwise any thumbnail
            thumbnail = image_links.get('thumbnail', image_links.get('smallThumbnail', 'No image available'))
            
            # Extract the year from the published date
            year = published_date.split('-')[0] if published_date != 'N/A' else 'N/A'

            return {
                'title': title,
                'authors': authors,
                'publishedDate': published_date,
                'year': year,
                'description': description,
                'pageCount': page_count,
                'thumbnail': thumbnail
            }
    except requests.exceptions.RequestException as e:
        print(f"Error fetching book data for title '{title}': {e}")
        return None

    # Return None if no items were found
    return None


def extract_wikipedia_title_from_url(url):
    """
    Extracts the article title from a Wikipedia URL.
    Example URL: https://en.wikipedia.org/wiki/Albert_Einstein
    """
    match = re.search(r"wikipedia\.org/wiki/([^/?#]+)", url)
    if match:
        # Replace underscores with spaces and decode URL encoding
        title = match.group(1).replace("_", " ")
        return title
    return None


def get_wikipedia_data(title):
    """
    Fetches Wikipedia article data using the Wikipedia API.
    """
    if not title:
        return None

    # Wikipedia API endpoint for page summary
    url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
    
    try:
        response = requests.get(url)
        response.raise_for_status()
        data = response.json()
        
        # Extract relevant information
        return {
            'title': data.get('title', 'No title available'),
            'extract': data.get('extract', 'No summary available.'),
            'thumbnail': data.get('thumbnail', {}).get('source', ''),
            'page_url': data.get('content_urls', {}).get('desktop', {}).get('page', ''),
            'description': data.get('description', ''),
            'lang': data.get('lang', 'en')
        }
        
    except requests.exceptions.RequestException as e:
        print(f"Error fetching Wikipedia data for title '{title}': {e}")
        return None
    except json.JSONDecodeError as e:
        print(f"Error parsing Wikipedia response for title '{title}': {e}")
        return None

    return None

def analyze_user_intent(question):
    """
    Analyzes user intent to determine if they want to search notes or just chat.
    Returns: {'type': 'search'|'chat', 'temporal_query': bool, 'search_terms': list}
    """
    question_lower = question.lower().strip()
    
    # Temporal keywords that indicate time-based queries
    temporal_keywords = [
        'last', 'latest', 'recent', 'yesterday', 'today', 'this week', 'last week',
        'this month', 'last month', 'ago', 'when did', 'what time', 'recently',
        'new', 'newest', 'oldest', 'first', 'before', 'after', 'since'
    ]
    
    # Search intent keywords
    search_keywords = [
        'find', 'search', 'look for', 'show me', 'what do you know about',
        'tell me about', 'information about', 'details on', 'notes about',
        'do i have', 'have i', 'my notes on', 'anything about'
    ]
    
    # Chat intent keywords (casual conversation)
    chat_keywords = [
        'hello', 'hi', 'hey', 'how are you', 'what can you do', 'help',
        'thanks', 'thank you', 'good morning', 'good evening', 'what is',
        'explain', 'define', 'how does', 'why does', 'what does'
    ]
    
    # Check for temporal queries
    has_temporal = any(keyword in question_lower for keyword in temporal_keywords)
    
    # Check for search intent
    has_search_intent = any(keyword in question_lower for keyword in search_keywords)
    
    # Check for chat intent
    has_chat_intent = any(keyword in question_lower for keyword in chat_keywords)
    
    # Determine intent
    if has_search_intent or has_temporal or ('my' in question_lower and ('notes' in question_lower or 'vault' in question_lower)):
        intent_type = 'search'
    elif has_chat_intent and not has_temporal:
        intent_type = 'chat'
    else:
        # Default to search if unclear but contains specific terms
        intent_type = 'search' if len(question.split()) > 2 else 'chat'
    
    return {
        'type': intent_type,
        'temporal_query': has_temporal,
        'search_terms': question.split()
    }

def get_temporal_context(notes, query_lower):
    """
    Provides temporal context about notes based on the query.
    """
    now = datetime.now()
    
    # Sort notes by creation time (newest first)
    sorted_notes = sorted(notes, key=lambda x: x.get('createdTime', 0), reverse=True)
    
    temporal_context = {
        'latest_notes': sorted_notes[:5],  # Last 5 notes
        'today_notes': [],
        'this_week_notes': [],
        'this_month_notes': []
    }
    
    for note in sorted_notes:
        created_time = note.get('createdTime', 0)
        if created_time:
            note_date = datetime.fromtimestamp(created_time / 1000)
            
            # Today's notes
            if note_date.date() == now.date():
                temporal_context['today_notes'].append(note)
            
            # This week's notes
            week_start = now - timedelta(days=now.weekday())
            if note_date >= week_start:
                temporal_context['this_week_notes'].append(note)
            
            # This month's notes
            if note_date.month == now.month and note_date.year == now.year:
                temporal_context['this_month_notes'].append(note)
    
    return temporal_context

def create_user_profile(notes):
    """
    Creates a dynamic user profile based on their notes.
    """
    if not notes:
        return {}
    
    # Analyze note patterns
    media_notes = [n for n in notes if n.get('isMediaNote')]
    audio_notes = [n for n in notes if n.get('isAudioNote')]
    regular_notes = [n for n in notes if not n.get('isMediaNote') and not n.get('isAudioNote')]
    
    # Get recent activity
    recent_notes = sorted(notes, key=lambda x: x.get('createdTime', 0), reverse=True)[:10]
    
    # Extract common themes/topics
    all_content = ' '.join([note.get('rawContent', '') for note in notes])
    
    profile = {
        'total_notes': len(notes),
        'media_notes_count': len(media_notes),
        'audio_notes_count': len(audio_notes),
        'regular_notes_count': len(regular_notes),
        'recent_activity': recent_notes,
        'interests': extract_interests(all_content),
        'note_taking_style': analyze_note_style(notes)
    }
    
    return profile

def extract_interests(content):
    """
    Extracts potential interests/topics from note content.
    """
    # Simple keyword extraction - could be enhanced with NLP
    common_topics = [
        'movie', 'film', 'book', 'music', 'technology', 'programming', 'coding',
        'travel', 'food', 'health', 'fitness', 'business', 'finance', 'art',
        'science', 'history', 'philosophy', 'psychology', 'education'
    ]
    
    content_lower = content.lower()
    found_interests = []
    
    for topic in common_topics:
        if topic in content_lower:
            count = content_lower.count(topic)
            if count > 2:  # Only include if mentioned multiple times
                found_interests.append({'topic': topic, 'frequency': count})
    
    return sorted(found_interests, key=lambda x: x['frequency'], reverse=True)[:5]

def analyze_note_style(notes):
    """
    Analyzes the user's note-taking patterns.
    """
    if not notes:
        return {}
    
    total_length = sum(len(note.get('rawContent', '')) for note in notes)
    avg_length = total_length / len(notes) if notes else 0
    
    # Check for markdown usage
    markdown_usage = sum(1 for note in notes if any(marker in note.get('rawContent', '') 
                        for marker in ['#', '**', '*', '`', '[]', '- ']))
    
    return {
        'average_note_length': avg_length,
        'uses_markdown': markdown_usage > len(notes) * 0.3,  # 30% threshold
        'note_frequency': 'high' if len(notes) > 100 else 'medium' if len(notes) > 20 else 'low'
    }

def chat_with_mymind(question, context=None, all_notes=None):
    """
    Enhanced chat function with better intelligence and conversation flow.
    """
    # Analyze user intent
    intent = analyze_user_intent(question)
    
    # Create user profile if we have all notes
    user_profile = create_user_profile(all_notes) if all_notes else {}
    
    # Get temporal context if it's a temporal query
    temporal_context = get_temporal_context(all_notes, question.lower()) if all_notes and intent['temporal_query'] else {}
    
    if context or intent['type'] == 'search':
        # This is a search-based query
        prompt = create_search_prompt(question, context, user_profile, temporal_context, intent)
    else:
        # This is a casual chat
        prompt = create_chat_prompt(question, user_profile)
    
    try:
        response = model.generate_content(prompt, stream=True)
        for chunk in response:
            if chunk.text:
                yield {"token": chunk.text}
        
        # Add sources if we used context
        if context:
            source_files = [note['path'] for note in context]
            yield {"sources": source_files}
            
    except Exception as e:
        import traceback
        print(f"Error calling Gemini API: {e}")
        print(f"Full traceback: {traceback.format_exc()}")
        yield {"error": "Sorry, I encountered an error trying to generate a response."}

def create_search_prompt(question, context, user_profile, temporal_context, intent):
    """
    Creates an enhanced prompt for search-based queries.
    """
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    prompt = f"""You are an intelligent personal assistant with deep knowledge of the user's notes and interests. 

CURRENT TIME: {current_time}

USER PROFILE:
- Total notes: {user_profile.get('total_notes', 0)}
- Note-taking style: {user_profile.get('note_taking_style', {}).get('note_frequency', 'unknown')} frequency
- Primary interests: {', '.join([i['topic'] for i in user_profile.get('interests', [])[:3]])}

QUERY ANALYSIS:
- Intent: {'Temporal search' if intent['temporal_query'] else 'Content search'}
- Type: {intent['type']}

"""

    if temporal_context:
        prompt += f"""TEMPORAL CONTEXT:
- Latest notes ({len(temporal_context.get('latest_notes', []))}): {', '.join([n['path'].split('/')[-1] for n in temporal_context.get('latest_notes', [])[:3]])}
- Today's notes: {len(temporal_context.get('today_notes', []))}
- This week's notes: {len(temporal_context.get('this_week_notes', []))}

"""

    if context:
        prompt += "RELEVANT NOTES FOUND:\n"
        for i, note in enumerate(context, 1):
            # Add temporal info
            created_time = ""
            if 'createdTimeReadable' in note or 'createdTime' in note:
                if 'createdTimeReadable' in note:
                    created_time = f" (Created: {note['createdTimeReadable']})"
                elif 'createdTime' in note:
                    try:
                        dt = datetime.fromtimestamp(note['createdTime'] / 1000)
                        created_time = f" (Created: {dt.strftime('%Y-%m-%d %H:%M')})"
                    except:
                        pass
            
            note_type = ""
            if note.get('is_media_note'):
                note_type = f" [MEDIA: {note.get('media_type', 'unknown').upper()}]"
            elif note.get('is_audio_note'):
                note_type = " [AUDIO]"
            
            tags_info = ""
            if note.get('tags'):
                tags_info = f" (Tags: {', '.join(note['tags'])})"
            
            prompt += f"\n--- NOTE {i}: {note['path']}{note_type}{created_time}{tags_info} ---\n"
            prompt += f"{note['content']}\n"
        
        prompt += "\n--- END OF NOTES ---\n\n"
    else:
        prompt += "No specific notes found for this query.\n\n"

    prompt += f"""INSTRUCTIONS:
- Answer naturally and conversationally, like you know the user well
- Use the notes to provide accurate, personalized information
- For temporal queries (latest, recent, last, etc.), pay special attention to creation dates
- Synthesize information across multiple notes when relevant
- Always mention source note names when referencing specific information
- If asking about "last" or "latest" items, focus on the most recently created notes
- Be specific about dates and times when relevant
- If no relevant notes found, suggest what kind of notes might help answer similar questions in the future

User Question: {question}

Response:"""

    return prompt

def create_chat_prompt(question, user_profile):
    """
    Creates a prompt for casual conversation.
    """
    prompt = f"""You are a friendly, intelligent personal assistant. You're having a casual conversation with someone who uses you to manage their personal knowledge base.

USER CONTEXT:
- They have {user_profile.get('total_notes', 0)} notes in their collection
- Their interests include: {', '.join([i['topic'] for i in user_profile.get('interests', [])[:3]])}
- They use their notes for: {'media tracking, ' if user_profile.get('media_notes_count', 0) > 0 else ''}{'audio notes, ' if user_profile.get('audio_notes_count', 0) > 0 else ''}general note-taking

CONVERSATION STYLE:
- Be warm, friendly, and conversational
- Show personality and enthusiasm
- Reference their note-taking habits when relevant
- Offer helpful suggestions related to their interests
- Keep responses concise but engaging
- Don't be overly formal or robotic

Question: {question}

Response:"""

    return prompt
