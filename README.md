# MyMind - Enhanced AI Note Assistant

## Overview
MyMind is a Flask-based web application for managing and interacting with Markdown notes stored in an Obsidian vault. It provides a rich interface for viewing notes, media content (movies/TV via TMDb, Wikipedia), audio files, and chatting with an AI assistant powered by Google Gemini.

## Recent Enhancements: Smarter Temporal Query Handling
To make the AI more intelligent about daily clipped notes, the following improvements were implemented:

### 1. Enhanced Intent Analysis (`api.py`)
- Added detection for "today", "clipped today", and "clip today" queries in `analyze_user_intent()`.
- New return field: `'date_filter': {'type': 'today'}` for today-specific queries.
- This allows the system to recognize when users ask about notes clipped/created on the current day.

### 2. Improved Temporal Context (`api.py`)
- `get_temporal_context()` now accepts `specific_filter` parameter (e.g., 'today').
- Returns `'filtered_notes'` key with only notes matching the filter (e.g., today's notes based on `createdTime` timestamp).
- Maintains backward compatibility with existing temporal buckets (latest_notes, today_notes, etc.).

### 3. Date-Aware Search Filtering (`app.py`)
- `enhanced_search_for_chat()` accepts `date_filter` and filters notes to today's if `{'type': 'today'}`.
- Uses `datetime.fromtimestamp(note['createdTime'] / 1000).date() == date.today()` for precise filtering.
- `handle_temporal_query()` prioritizes date_filter over content_type (e.g., movie), using all today's notes for "what I clipped today".

### 4. Strict Prompt Instructions (`api.py`)
- `create_search_prompt()` checks for `date_filter` and adds explicit instructions: "Only use and reference notes from today. Do not include or mention any notes created on other dates."
- For today queries, note metadata includes "(Clipped today: ...)" for context.
- Updated general instructions to emphasize date specificity and handle "no notes today" gracefully.

### 5. Chat Endpoint Integration (`app.py`)
- `/api/chat` analyzes intent to extract `date_filter` and passes it to search and context functions.
- Ensures streaming responses only draw from filtered (today's) notes, with sources limited accordingly.

## Usage
- **Clipping Notes**: Use the "Add Note" button to create new .md files; `createdTime` uses file birthtime (or mtime fallback) for "clipped" timestamp.
- **Querying Today's Clips**: In chat, ask "what I clipped today" or "show me today's notes" – AI will respond with only today's content.
- **Other Temporal Queries**: "Latest movies", "What did I clip yesterday?" (note: yesterday requires future extension).

## Technical Notes
- Notes stored in: `/Volumes/Ohne Titel - Daten/Users/mac/Downloads/Obsidian` (configurable in app.py).
- AI uses Gemini 1.5 Flash; requires GEMINI_API_KEY in .env.
- Run with `python app.py` on port 6769.
- Frontend chat streams responses and shows clickable sources.

## Future Improvements
- Support for "yesterday", "last week" date filters.
- Better handling of file timestamps for moved/copied notes.
- Frontend suggestions update for "What did I clip today?".

See code diffs in git history for implementation details.

### AI Backend Migration: OpenRouter (December 2025)
To leverage more advanced models and better integration, the AI assistant has been migrated from Google Gemini to OpenRouter (OpenAI-compatible API).

#### Key Changes
- **Dependency**: Added `openai` to requirements.txt.
- **Configuration**: Uses `OpenAI` client with `base_url="https://openrouter.ai/api/v1"` and API key from `.env` (OPENROUTER_API_KEY).
- **Model**: "openrouter/sonoma-sky-alpha" for advanced reasoning and context handling.
- **Streaming**: `chat_with_mymind` now builds OpenAI messages format (system + user with note context) and uses `stream=True` for real-time response streaming, maintaining compatibility with frontend EventSource.
- **Headers**: Optional `extra_headers` for site attribution (HTTP-Referer, X-Title) to support OpenRouter rankings.
- **Compatibility**: Text-only chat preserved; future image support possible via message content arrays.
- **Prompt Structure**: System prompt includes user profile, temporal context, and instructions; user content embeds question and relevant notes.

#### Setup
1. Install dependencies: `pip install -r requirements.txt`
2. Set API key in `.env`: `OPENROUTER_API_KEY=your_key_here`
3. The original GEMINI_API_KEY can remain for fallback or removal.

#### Benefits
- Access to diverse models via OpenRouter.
- Better streaming performance and compatibility.
- Maintains all temporal query enhancements (e.g., "what I clipped today").

See api.py for implementation details.
