import requests
import re
import json

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