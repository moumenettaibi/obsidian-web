// --- DOM Elements ---
const cardContainer = document.getElementById('card-container');
const searchInput = document.getElementById('searchInput');
const loadingIndicator = document.getElementById('loading-indicator');
const importBtn = document.getElementById('import-btn');
const folderTagsContainer = document.getElementById('folder-tags-container');

// MODIFIED: New Note Modal Elements
const addNoteBtn = document.getElementById('add-note-btn');
const newNoteModal = document.getElementById('new-note-modal');
const newNoteTitle = document.getElementById('new-note-title'); // Changed from newNoteEditor
const newNoteContent = document.getElementById('new-note-content'); // Added
const newNoteSaveBtn = document.getElementById('new-note-save-btn');
const newNoteCloseBtn = document.getElementById('new-note-close-btn');

// ADDED: Shortcuts Popup Elements
const shortcutsHelpBtn = document.getElementById('shortcuts-help-btn');
const shortcutsPopup = document.getElementById('shortcuts-popup');

// Standard Note Modal Elements
const noteModal = document.getElementById('note-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalTags = document.getElementById('modal-tags');
const modalEditBtn = document.getElementById('modal-edit-btn');
const modalDeleteBtn = document.getElementById('modal-delete-btn');
const modalTitleInput = document.getElementById('modal-title-input');

// Media Modal Elements
const mediaModal = document.getElementById('media-modal');
const mediaModalCloseBtn = document.getElementById('media-modal-close-btn');
const mediaModalDeleteBtn = document.getElementById('media-modal-delete-btn');
const mediaModalBackdrop = document.getElementById('media-modal-backdrop');
const mediaModalPoster = document.getElementById('media-modal-poster');
const mediaModalTitle = document.getElementById('media-modal-title');
const mediaModalMeta = document.getElementById('media-modal-meta');
const mediaModalGenres = document.getElementById('media-modal-genres');
const mediaModalOverview = document.getElementById('media-modal-overview');

// Audio Modal Elements
const audioModal = document.getElementById('audio-modal');
const audioModalCloseBtn = document.getElementById('audio-modal-close-btn');
const audioModalDeleteBtn = document.getElementById('audio-modal-delete-btn');
const audioModalBackdrop = document.getElementById('audio-modal-backdrop');
const audioModalCD = document.getElementById('audio-modal-cd');
const audioModalTitle = document.getElementById('audio-modal-title');
const audioModalArtist = document.getElementById('audio-modal-artist');
const audioModalPlayer = document.getElementById('audio-modal-player');

// Wikipedia Modal Elements
const wikipediaModal = document.getElementById('wikipedia-modal');
const wikipediaModalCloseBtn = document.getElementById('wikipedia-modal-close-btn');
const wikipediaModalDeleteBtn = document.getElementById('wikipedia-modal-delete-btn');
const wikipediaModalEditBtn = document.getElementById('wikipedia-modal-edit-btn');
const wikipediaModalTitle = document.getElementById('wikipedia-modal-title');
const wikipediaModalTitleInput = document.getElementById('wikipedia-modal-title-input');
const wikipediaModalBody = document.getElementById('wikipedia-modal-body');
const wikipediaModalTags = document.getElementById('wikipedia-modal-tags');
const wikipediaIframe = document.getElementById('wikipedia-iframe');

// Chat Modal Elements
const chatBtn = document.getElementById('chat-btn');
const chatModal = document.getElementById('chat-modal');
const chatCloseBtn = document.getElementById('chat-close-btn');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

// Custom Player Elements
const playPauseBtn = document.getElementById('play-pause-btn');
const timelineContainer = document.getElementById('timeline-container');
const timelineProgress = document.getElementById('timeline-progress');
const currentTimeEl = document.getElementById('current-time');
const totalDurationEl = document.getElementById('total-duration');


// --- State Variables ---
let allNotes = [];
let mediaPathMap = new Map();
let fuse;
let topLevelFolders = new Set();
let activeFolderFilter = null;
let isDataLoaded = false;

// Modal and Sync state
let currentNoteInModal = null;
let currentMediaNoteInModal = null;
let currentAudioNoteInModal = null;
let currentWikipediaNoteInModal = null;
let isEditMode = false;
let isWikipediaEditMode = false;
let autoSaveTimer = null;
let syncInterval = null;
let cardObserver = null;

// --- Caching Logic ---
const CACHE_PREFIX = 'tmdb_cache_';
const CACHE_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

const cache = {
    get(key) {
        const itemStr = localStorage.getItem(CACHE_PREFIX + key);
        if (!itemStr) return null;

        try {
            const item = JSON.parse(itemStr);
            const now = new Date().getTime();
            if (now > item.expiry) {
                localStorage.removeItem(CACHE_PREFIX + key);
                return null;
            }
            return item.value;
        } catch (e) {
            console.error("Error parsing cache item:", e);
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }
    },
    set(key, value) {
        const now = new Date().getTime();
        const item = {
            value: value,
            expiry: now + CACHE_EXPIRATION_MS,
        };
        try {
            localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(item));
        } catch (e) {
            console.error("Error setting cache item:", e);
        }
    }
};

// --- API Client ---
const api = {
    async getNotes() {
        const response = await fetch('/api/notes');
        if (!response.ok) throw new Error('Failed to fetch notes');
        return response.json();
    },
    async getTMDbDetails(type, slug) {
        const cacheKey = `${type}_${slug}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log(`[CACHE HIT] Found data for ${cacheKey}`);
            return cachedData;
        }

        console.log(`[CACHE MISS] Fetching data for ${cacheKey} from API`);
        const response = await fetch(`/api/tmdb_details?type=${encodeURIComponent(type)}&slug=${encodeURIComponent(slug)}`);
        if (response.status === 404) {
            console.warn(`TMDb details not found for ${type}/${slug}`);
            return null;
        }
        if (!response.ok) throw new Error(`Failed to fetch TMDb data for ${type}/${slug}`);

        const data = await response.json();
        cache.set(cacheKey, data);
        return data;
    },
    async getWikipediaDetails(slug) {
        const cacheKey = `wikipedia_${slug}`;
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            console.log(`[CACHE HIT] Found Wikipedia data for ${cacheKey}`);
            return cachedData;
        }

        console.log(`[CACHE MISS] Fetching Wikipedia data for ${cacheKey} from API`);
        const response = await fetch(`/api/wikipedia_details?slug=${encodeURIComponent(slug)}`);
        if (response.status === 404) {
            console.warn(`Wikipedia details not found for ${slug}`);
            return null;
        }
        if (!response.ok) throw new Error(`Failed to fetch Wikipedia data for ${slug}`);

        const data = await response.json();
        cache.set(cacheKey, data);
        return data;
    },
    async createNote(path, content) {
        const response = await fetch('/api/note', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path,
                content
            })
        });
        if (!response.ok) throw new Error('Failed to create note');
        return response.json();
    },
    async updateNote(old_path, new_path, content) {
        const response = await fetch('/api/note', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                old_path,
                new_path,
                content
            })
        });
        if (!response.ok) throw new Error('Failed to update note');
        return response.json();
    },
    async deleteNote(path) {
        const response = await fetch('/api/note', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path
            })
        });
        if (!response.ok) throw new Error('Failed to delete note');
        return response.json();
    }
};

// --- Utility Functions ---
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- Core Application Logic ---
async function initialize() {
    marked.setOptions({
        breaks: true,
        gfm: true
    });

    initializeCustomPlayer();
    await loadNotesFromServer();
    lucide.createIcons();
}

async function loadNotesFromServer() {
    loadingIndicator.innerHTML = '<p class="text-gray-500">Reading your mind...</p>';
    loadingIndicator.style.display = 'block';
    cardContainer.innerHTML = '';

    try {
        const data = await api.getNotes();

        allNotes = data.notes.map(note => {
            const {
                tags,
                contentWithoutTags
            } = parseNoteContent(note.rawContent);
            const processedNote = { ...note,
                tags,
                contentWithoutTags,
                isAudioNote: false
            };

            const audioMatch = note.rawContent.match(/!\[\[\s*(.*?\.(mp3))\s*\]\]/i);
            if (audioMatch) {
                processedNote.isAudioNote = true;
                processedNote.audioFileName = audioMatch[1].trim();
            }

            return processedNote;
        });

        topLevelFolders = new Set(data.folders);

        mediaPathMap.clear();
        for (const [filename, path] of Object.entries(data.media_files)) {
            mediaPathMap.set(filename, path);
        }

        fuse = new Fuse(allNotes, {
            includeScore: true,
            keys: ['rawContent', 'path', 'tags', 'tmdb_data.title', 'tmdb_data.name'],
            threshold: 0.4,
            ignoreLocation: true,
        });

        isDataLoaded = true;

        renderFolderTags();
        applyFilters();

        if (allNotes.length === 0) {
            loadingIndicator.innerHTML = `<p class="text-gray-500">No Markdown (.md) files found. Add one above!</p>`;
        } else {
            loadingIndicator.style.display = 'none';
        }

    } catch (error) {
        console.error("Error loading notes from server:", error);
        loadingIndicator.innerHTML = `<p class="text-red-500">Error: Could not connect to the server.</p>`;
    } finally {
        updateNewNoteSaveButtonState();
        startRealtimeSync();
    }
}

function parseNoteContent(rawContent) {
    let tags = [];
    let contentWithoutTags = rawContent;
    const lines = rawContent.split('\n');

    if (lines[0] && lines[0].trim() === '---') {
        const endYamlIndex = lines.indexOf('---', 1);
        if (endYamlIndex !== -1) {
            const yamlBlock = lines.slice(1, endYamlIndex);
            contentWithoutTags = lines.slice(endYamlIndex + 1).join('\n').trim();
            let isTagSection = false;
            for (const line of yamlBlock) {
                if (line.trim().startsWith('tags:')) {
                    isTagSection = true;
                    continue;
                }
                if (isTagSection) {
                    const match = line.match(/^\s*-\s*(.*)/);
                    if (match && match[1]) {
                        tags.push(match[1].trim());
                    } else {
                        isTagSection = false;
                    }
                }
            }
        }
    } else if (lines[0] && lines[0].toLowerCase().startsWith('tags:')) {
        const tagsLine = lines.shift();
        contentWithoutTags = lines.join('\n');
        tags = tagsLine.replace(/tags:\s*/i, '').split('-').map(tag => tag.trim()).filter(tag => tag.length > 0);
    }
    return {
        tags,
        contentWithoutTags
    };
}

async function deleteNote() {
    if (!currentNoteInModal) return;

    if (window.confirm(`Are you sure you want to delete "${currentNoteInModal.path}"?`)) {
        try {
            await api.deleteNote(currentNoteInModal.path);
            updateNoteInState({
                path: currentNoteInModal.path
            }, 'delete');
            hideModal();
        } catch (error) {
            console.error(`Error deleting file: ${currentNoteInModal.path}`, error);
            alert("Failed to delete note. See console for details.");
        }
    }
}

// MODIFIED: Function to handle creation from the new modal with separate title/content
async function createNewNoteFromModal() {
    const title = newNoteTitle.value.trim();
    const content = newNoteContent.value.trim();

    if (!title || !isDataLoaded) return; // Title is now the required field

    newNoteSaveBtn.disabled = true;

    // Combine title and content. We'll use the title as a Markdown H1 header.
    const rawContent = `# ${title}\n\n${content}`;

    let sanitizedTitle = title
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-.]/g, '')
        .replace(/--+/g, '-')
        .substring(0, 50) || `note-${Date.now()}`;

    let fileName = `${sanitizedTitle}.md`;

    let finalPath = fileName;
    if (activeFolderFilter && activeFolderFilter !== 'all') {
        finalPath = `${activeFolderFilter}/${fileName}`;
    }

    try {
        await api.createNote(finalPath, rawContent);
        await checkForUpdates(true);
        hideNewNoteModal();
    } catch (error) {
        console.error("Error creating new note:", error);
        alert("Failed to create note. See console for details.");
    } finally {
        newNoteSaveBtn.disabled = false;
    }
}


function renderRichContent(content, lazyImages = false) {
    let processedContent = content;

    processedContent = processedContent.replace(/<iframe(.*?)><\/iframe>/gi, (match, attributes) => {
        const srcMatch = attributes.match(/src="([^"]*)"/);
        if (!srcMatch || !srcMatch[1]) return match;

        let src = srcMatch[1];
        if (src.includes('youtube.com')) {
            src = src.replace('youtube.com', 'youtube-nocookie.com');
        }

        const cleanIframe = `<iframe src="${src}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;

        return `<div class="video-embed-container">${cleanIframe}</div>`;
    });

    const createVideoEmbed = (url) => {
        let embedUrl = '';
        if (url.includes('youtube') || url.includes('youtu.be')) {
            const videoIdMatch = url.match(/(?:watch\?v=|embed\/|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (videoIdMatch && videoIdMatch[1]) embedUrl = `https://www.youtube-nocookie.com/embed/${videoIdMatch[1]}`;
        } else if (url.includes('vimeo')) {
            const videoIdMatch = url.match(/vimeo\.com\/(\d+)/);
            if (videoIdMatch && videoIdMatch[1]) embedUrl = `https://player.vimeo.com/video/${videoIdMatch[1]}`;
        }
        if (embedUrl) {
            return `<div class="video-embed-container"><iframe src="${embedUrl}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        }
        return null;
    };

    processedContent = processedContent.replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
        return createVideoEmbed(url.trim()) || match;
    });

    const videoRegex = /^(https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/|vimeo\.com\/)([a-zA-Z0-9_-]+[a-zA-Z0-9\/=?-]*))$/gm;
    processedContent = processedContent.replace(videoRegex, (match, url) => {
        return createVideoEmbed(url) || match;
    });

    processedContent = processedContent.replace(/!\[\[(.*?)\]\]/g, (match, fileName) => {
        const fileNameTrimmed = fileName.trim();
        const relativePath = mediaPathMap.get(fileNameTrimmed);

        if (!relativePath) {
            return `<p class="text-xs text-red-600 bg-red-100 p-2 rounded-md my-2">File not found: ${fileNameTrimmed}</p>`;
        }

        const fileUrl = `/api/media/${encodeURIComponent(relativePath)}`;
        const extension = fileNameTrimmed.split('.').pop().toLowerCase();

        switch (extension) {
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
            case 'svg':
            case 'webp':
                const srcAttr = lazyImages ? `data-src="${fileUrl}"` : `src="${fileUrl}"`;
                const classAttr = lazyImages ? 'class="lazy-image"' : '';
                return `<img ${srcAttr} ${classAttr} alt="${fileNameTrimmed}">`;

            case 'mp4':
            case 'webm':
            case 'ogv':
            case 'mov':
                return `<div class="media-embed-container"><video controls src="${fileUrl}"></video></div>`;

            case 'mp3':
            case 'ogg':
            case 'wav':
            case 'flac':
                return `<div class="media-embed-container"><audio controls src="${fileUrl}"></audio></div>`;

            case 'pdf':
                return `<iframe class="pdf-embed-simple" src="${fileUrl}"></iframe>`;

            default:
                return `<div class="media-embed-container">
                                    <a href="${fileUrl}" download="${fileNameTrimmed}" class="unknown-file-embed">
                                        <i data-lucide="file-down" class="w-6 h-6 text-gray-500 flex-shrink-0"></i>
                                        <div class="flex-grow">
                                            <p class="font-semibold">${fileNameTrimmed}</p>
                                            <p class="text-sm text-gray-500">Click to download</p>
                                        </div>
                                    </a>
                                </div>`;
        }
    });

    processedContent = processedContent.replace(/\[\[(.*?)\]\]/g, (match, linkName) => {
        if (match.startsWith('!')) return match;
        return `<a href="#" class="internal-link" data-link-name="${linkName.trim()}">${linkName.trim()}</a>`;
    });

    return marked.parse(processedContent);
}

// --- UI Rendering ---

function createCardPlaceholder(note) {
    const div = document.createElement('div');
    div.className = 'card-placeholder bg-gray-200 rounded-lg';
    div.dataset.id = note.id;
    if (note.isMediaNote) {
        div.style.aspectRatio = '2 / 3';
    } else if (note.isAudioNote) {
        div.style.aspectRatio = '1 / 1';
    } else {
        div.style.minHeight = '200px';
    }
    return div;
}

function renderCards(notesToRender) {
    cardContainer.innerHTML = '';
    if (cardObserver) cardObserver.disconnect();
    if (notesToRender.length === 0) return;

    cardObserver = new IntersectionObserver(async (entries, observer) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                const placeholder = entry.target;
                const noteId = placeholder.dataset.id;
                observer.unobserve(placeholder);

                const note = allNotes.find(n => n.id === noteId);
                if (!note) continue;

                if (note.isMediaNote && !note.tmdb_data) {
                    try {
                        if (note.media_type === 'wikipedia') {
                            // Extract Wikipedia URL from the note content (including different language versions)
                            const wikipediaUrlMatch = note.rawContent.match(/https?:\/\/(?:www\.)?[a-z]{2}\.wikipedia\.org\/wiki\/[^\s\n]+/g);
                            if (wikipediaUrlMatch && wikipediaUrlMatch.length > 0) {
                                const wikipediaUrl = wikipediaUrlMatch[wikipediaUrlMatch.length - 1]; // Get the last URL
                                const urlMatch = wikipediaUrl.match(/[a-z]{2}\.wikipedia\.org\/wiki\/([^/\s?#]+)/);
                                if (urlMatch) {
                                    const articleSlug = urlMatch[1].replace(/_/g, ' ');
                                    const data = await api.getWikipediaDetails(articleSlug);
                                    if (data) {
                                        note.tmdb_data = data;
                                        note.wikipediaUrl = wikipediaUrl; // Store the actual URL
                                    }
                                }
                            }
                        } else {
                            const data = await api.getTMDbDetails(note.media_type, note.title_slug);
                            if (data) {
                                note.tmdb_data = data;
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to lazy-load data for ${note.path}`, error);
                    }
                }

                const fullCard = createCardElement(note, searchInput.value.trim());
                placeholder.replaceWith(fullCard);
                lucide.createIcons({
                    nodes: [fullCard]
                });
            }
        }
    }, {
        rootMargin: '200px 0px',
        threshold: 0
    });

    notesToRender.forEach(note => {
        const placeholder = createCardPlaceholder(note);
        cardContainer.appendChild(placeholder);
        cardObserver.observe(placeholder);
    });
}

function createCardElement(note, highlightTerm) {
    const div = document.createElement('div');
    div.dataset.id = note.id;

    if (note.isAudioNote) {
        div.className = 'audio-card';
        const formattedTitle = note.audioFileName
            .replace(/\.mp3$/i, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());

        div.innerHTML = `
                    <div class="audio-card-content">
                        <div class="audio-card-icon">
                            <i data-lucide="music-4" class="w-8 h-8 text-violet-400"></i>
                        </div>
                        <div>
                           <h3 class="audio-card-title truncate" title="${formattedTitle}">${formattedTitle}</h3>
                           <p class="text-sm text-gray-400 truncate">${note.path.replace(/\.md$/, '')}</p>
                        </div>
                    </div>
                `;
        return div;
    }

    if (note.isMediaNote && note.media_type === 'wikipedia') {
        div.className = 'card bg-white border border-gray-200/80 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden relative aspect-[2/3]';
        
        // Extract Wikipedia URL and article title from the note content (including different language versions)
        const wikipediaUrlMatch = note.rawContent.match(/https?:\/\/(?:www\.)?[a-z]{2}\.wikipedia\.org\/wiki\/[^\s\n]+/g);
        let articleTitle = 'Wikipedia Article';
        
        if (wikipediaUrlMatch && wikipediaUrlMatch.length > 0) {
            const wikipediaUrl = wikipediaUrlMatch[wikipediaUrlMatch.length - 1]; // Get the last URL
            const urlMatch = wikipediaUrl.match(/[a-z]{2}\.wikipedia\.org\/wiki\/([^/\s?#]+)/);
            if (urlMatch) {
                articleTitle = urlMatch[1].replace(/_/g, ' ');
            }
        }
        
        if (note.tmdb_data) {
            const data = note.tmdb_data;
            const title = (data.title || articleTitle) + ' - Wikipedia';
            
            div.innerHTML = `
                        <div class="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100"></div>
                        <div class="absolute top-4 left-4 wikipedia-logo">
                            <img src="https://img.icons8.com/?size=512&id=gDi80jDvhca2&format=png" alt="Wikipedia" width="32" height="32">
                        </div>
                        <div class="absolute inset-0 flex flex-col justify-center items-center p-6 text-center">
                            <h3 class="text-gray-800 text-xl font-serif-display font-bold leading-tight mb-4" title="${title}">${title}</h3>
                            <div class="text-gray-500 text-sm font-medium">Wikipedia</div>
                        </div>`;
        } else {
            // Fallback for when Wikipedia data hasn't been loaded yet
            const title = articleTitle;
            
            div.innerHTML = `
                        <div class="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100"></div>
                        <div class="absolute top-4 left-4 wikipedia-logo">
                            <img src="https://img.icons8.com/?size=512&id=gDi80jDvhca2&format=png" alt="Wikipedia" width="32" height="32">
                        </div>
                        <div class="absolute inset-0 flex flex-col justify-center items-center p-6 text-center">
                            <h3 class="text-gray-800 text-xl font-serif-display font-bold leading-tight mb-4" title="${title}">${title}</h3>
                            <div class="text-gray-500 text-sm font-medium">Wikipedia</div>
                        </div>`;
        }
        return div;
    }

    if (note.isMediaNote && note.tmdb_data) {
        div.className = 'card bg-white border border-gray-200/80 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden relative aspect-[2/3]';
        const data = note.tmdb_data;
        const posterPath = data.poster_path;
        const title = data.title || data.name;
        const releaseDate = data.release_date || data.first_air_date;
        const year = releaseDate ? new Date(releaseDate).getFullYear() : 'NR';
        const rating = data.vote_average ? data.vote_average.toFixed(1) : 'NR';
        const posterUrl = posterPath ?
            `https://image.tmdb.org/t/p/w500${posterPath}` :
            '[https://placehold.co/500x750/e2e8f0/4a5568?text=No+Poster](https://placehold.co/500x750/e2e8f0/4a5568?text=No+Poster)';

        const mediaType = data.hasOwnProperty('title') ? 'MOVIE' : 'TV';

        div.innerHTML = `
                    <img src="${posterUrl}" alt="Poster for ${title}" class="absolute inset-0 w-full h-full object-cover" onerror="this.onerror=null;this.src='[https://placehold.co/500x750/e2e8f0/4a5568?text=Error](https://placehold.co/500x750/e2e8f0/4a5568?text=Error)';">
                    <div class="absolute top-2.5 right-2.5 bg-black/60 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full backdrop-blur-sm">${mediaType}</div>
                    <div class="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-4 flex flex-col justify-end text-shadow">
                        <h3 class="text-white text-lg font-bold truncate" title="${title}">${title}</h3>
                        <div class="flex items-center text-sm text-gray-300 mt-1 space-x-3">
                            <span>${year}</span>
                            <span class="flex items-center">
                                <i data-lucide="star" class="w-3.5 h-3.5 text-yellow-400 fill-current mr-1"></i> 
                                <span>${rating}</span>
                            </span>
                        </div>
                    </div>`;
        return div;
    }

    // --- RENDER AS STANDARD NOTE CARD ---
    div.className = 'card bg-white border border-gray-200/80 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden flex flex-col';
    const tagsHTML = (note.tags && note.tags.length > 0) ?
        `<div class="tag-container flex flex-wrap">${note.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>` :
        '';

    let displayContent = renderRichContent(note.contentWithoutTags, true);

    if (highlightTerm) {
        const regex = new RegExp(`(${highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        displayContent = displayContent.replace(/>([^<]+)</g, (match, text) => `>${text.replace(regex, `<span class="highlight">$1</span>`)}<`);
    }

    div.innerHTML = `
                ${tagsHTML}
                <div class="p-4 card-content-preview flex-grow"><div class="markdown-content">${displayContent}</div></div>
                <div class="mt-auto p-4 border-t border-gray-100 bg-gray-50/50"><p class="text-xs text-gray-500 truncate" title="${note.path}">${note.path.replace(/\.md$/, '')}</p></div>`;

    div.querySelectorAll('img.lazy-image').forEach(img => {
        img.src = img.dataset.src;
        img.removeAttribute('data-src');
        img.classList.remove('lazy-image');
    });
    lucide.createIcons({
        nodes: [div]
    });

    return div;
}

function renderFolderTags() {
    folderTagsContainer.innerHTML = '';
    if (topLevelFolders.size > 0) {
        const allButton = document.createElement('button');
        allButton.className = 'folder-tag active';
        allButton.dataset.folder = 'all';
        allButton.innerHTML = `<i data-lucide="inbox"></i>All`;
        folderTagsContainer.appendChild(allButton);

        const sortedFolders = [...topLevelFolders].sort();
        sortedFolders.forEach(folder => {
            const button = document.createElement('button');
            button.className = 'folder-tag';
            button.dataset.folder = folder;
            button.innerHTML = `<i data-lucide="folder"></i>${folder}`;
            folderTagsContainer.appendChild(button);
        });
        lucide.createIcons();
    }
}

// MODIFIED: Manages the save button state based on the title field
function updateNewNoteSaveButtonState() {
    newNoteSaveBtn.disabled = !isDataLoaded || newNoteTitle.value.trim() === '';
}


/**
 * Applies filters based on search input and active folder.
 * Includes smart search functionality for keywords like dates, media types, etc.
 * Date search keywords: on:YYYY-MM-DD, before:YYYY-MM-DD, after:YYYY-MM-DD
 */
function applyFilters() {
    if (!isDataLoaded) return;
    let notesToDisplay = [...allNotes];

    // 1. Apply folder filter first
    if (activeFolderFilter && activeFolderFilter !== 'all') {
        notesToDisplay = notesToDisplay.filter(note => note.path.startsWith(`${activeFolderFilter}/`));
    }

    const searchTerm = searchInput.value.trim().toLowerCase();
    let searchWithoutKeywords = searchTerm;

    // 2. Apply smart search filters
    // Date filtering
    const dateRegex = /(on|before|after):(\d{4}-\d{2}-\d{2})/g;
    let match;
    // We need to create a new regex object for each search because of the stateful `g` flag
    const dateRegexForRemoval = new RegExp(dateRegex.source, 'g');
    
    while ((match = dateRegex.exec(searchTerm)) !== null) {
        const [, keyword, dateStr] = match;
        // The date string is parsed in the user's local timezone.
        // For example, '2024-01-15' becomes 2024-01-15 at 00:00:00 local time.
        if (keyword === 'on') {
            const startOfDay = new Date(dateStr);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateStr);
            endOfDay.setHours(23, 59, 59, 999);
            notesToDisplay = notesToDisplay.filter(note => 
                note.lastModified >= startOfDay.getTime() && note.lastModified <= endOfDay.getTime()
            );
        } else if (keyword === 'before') {
            const startOfDay = new Date(dateStr);
            startOfDay.setHours(0, 0, 0, 0);
            notesToDisplay = notesToDisplay.filter(note => note.lastModified < startOfDay.getTime());
        } else if (keyword === 'after') {
            const endOfDay = new Date(dateStr);
            endOfDay.setHours(23, 59, 59, 999);
            notesToDisplay = notesToDisplay.filter(note => note.lastModified > endOfDay.getTime());
        }
    }
    searchWithoutKeywords = searchWithoutKeywords.replace(dateRegexForRemoval, '').trim();

    // Other smart filters with exclusivity using an if-else-if chain
    if (searchWithoutKeywords.includes('movies') || searchWithoutKeywords.includes('movie')) {
        notesToDisplay = notesToDisplay.filter(note => note.isMediaNote && note.media_type === 'movie');
        searchWithoutKeywords = searchWithoutKeywords.replace(/movies|movie/g, '').trim();
    } else if (searchWithoutKeywords.includes('tv shows') || searchWithoutKeywords.includes('series')) {
        notesToDisplay = notesToDisplay.filter(note => note.isMediaNote && note.media_type === 'tv');
        searchWithoutKeywords = searchWithoutKeywords.replace(/tv shows|series/g, '').trim();
    } else if (searchWithoutKeywords.includes('youtube videos') || searchWithoutKeywords.includes('youtube')) {
        notesToDisplay = notesToDisplay.filter(note => note.rawContent.toLowerCase().includes('youtube.com') || note.rawContent.toLowerCase().includes('youtu.be'));
        searchWithoutKeywords = searchWithoutKeywords.replace(/youtube videos|youtube/g, '').trim();
    } else if (searchWithoutKeywords.includes('images') || searchWithoutKeywords.includes('image')) {
        const imageRegex = /!\[\[(.*?\.(png|jpg|jpeg|gif|svg|webp))\]\]|!\[.*?\]\((.*?\.(png|jpg|jpeg|gif|svg|webp))\)/i;
        // Ensure the note contains an image but IS NOT a special media or audio note.
        notesToDisplay = notesToDisplay.filter(note => imageRegex.test(note.rawContent) && !note.isMediaNote && !note.isAudioNote);
        searchWithoutKeywords = searchWithoutKeywords.replace(/images|image/g, '').trim();
    } else if (searchWithoutKeywords.includes('audios') || searchWithoutKeywords.includes('audio')) {
        notesToDisplay = notesToDisplay.filter(note => note.isAudioNote);
        searchWithoutKeywords = searchWithoutKeywords.replace(/audios|audio/g, '').trim();
    }

    let finalNotes;

    // 3. Perform fuzzy search on the remaining text
    if (searchWithoutKeywords && fuse) {
        const tempFuse = new Fuse(notesToDisplay, fuse.options);
        finalNotes = tempFuse.search(searchWithoutKeywords).map(result => result.item);
    } else {
        finalNotes = notesToDisplay;
    }

    // 4. Render the results
    renderCards(finalNotes);

    if (finalNotes.length === 0 && allNotes.length > 0) {
        loadingIndicator.innerHTML = `<p class="text-gray-500">No notes match your filters.</p>`;
        loadingIndicator.style.display = 'block';
    } else if (allNotes.length > 0) {
        loadingIndicator.style.display = 'none';
    }
}


function updateNoteInState(noteData, action = 'update') {
    const {
        path
    } = noteData;

    if (action === 'delete') {
        allNotes = allNotes.filter(n => n.path !== path);
    } else {
        const noteIndex = allNotes.findIndex(n => n.path === path);
        if (noteIndex > -1) {
            const {
                tags,
                contentWithoutTags
            } = parseNoteContent(noteData.rawContent);
            const updatedNote = { ...allNotes[noteIndex],
                ...noteData,
                tags,
                contentWithoutTags
            };
            allNotes[noteIndex] = updatedNote;

            if (currentNoteInModal && currentNoteInModal.path === path) {
                currentNoteInModal = updatedNote;
            }
        }
    }

    fuse.setCollection(allNotes);
    applyFilters();
}

// --- Real-time Sync Logic ---
function startRealtimeSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => checkForUpdates(false), 5000);
}

function stopRealtimeSync() {
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = null;
}

async function checkForUpdates(force = false) {
    if (!isDataLoaded || (isEditMode && !force) || (document.hidden && !force)) return;

    try {
        const serverData = await api.getNotes();
        const serverNotes = serverData.notes;

        const localNotesMap = new Map(allNotes.map(note => [note.path, note]));
        const serverNotesMap = new Map(serverNotes.map(note => [note.path, note]));
        let changesMade = false;

        if (allNotes.length !== serverNotes.length) {
            changesMade = true;
        } else {
            for (const [serverPath, serverNote] of serverNotesMap.entries()) {
                const localNote = localNotesMap.get(serverPath);
                if (!localNote || serverNote.lastModified > localNote.lastModified) {
                    changesMade = true;
                    break;
                }
            }
        }

        if (changesMade) {
            allNotes = serverNotes.map(note => ({ ...note,
                ...parseNoteContent(note.rawContent)
            }));
            fuse.setCollection(allNotes);
            applyFilters();
        }

    } catch (error) {
        console.warn("Sync check failed:", error.message);
    }
}


// --- Modal Logic ---

// MODIFIED: Functions to control the new note creation modal
function showNewNoteModal() {
    newNoteModal.classList.remove('hidden');
    // We need a slight delay for the transition to work correctly
    setTimeout(() => {
        newNoteModal.classList.add('visible');
        newNoteTitle.focus(); // Focus on the title input now
    }, 10);
}

function hideNewNoteModal() {
    newNoteModal.classList.remove('visible');
    setTimeout(() => {
        newNoteModal.classList.add('hidden');
        newNoteTitle.value = ''; // Clear title on close
        newNoteContent.value = ''; // Clear content on close
        newNoteContent.placeholder = ''; // Clear dynamic placeholder
        shortcutsPopup.classList.add('hidden'); // Also hide shortcuts popup
        updateNewNoteSaveButtonState();
    }, 300); // Match transition duration
}

function switchToViewMode() {
    if (!currentNoteInModal) return;
    isEditMode = false;
    modalBody.contentEditable = false;

    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
        saveNoteFromModal();
    }

    modalBody.innerHTML = renderRichContent(currentNoteInModal.contentWithoutTags, false);
    lucide.createIcons({
        nodes: [modalBody]
    });

    modalTitle.classList.remove('hidden');
    modalTitleInput.classList.add('hidden');
    modalEditBtn.innerHTML = '<i data-lucide="file-pen-line" class="h-5 w-5"></i>';
    lucide.createIcons({
        nodes: [modalEditBtn]
    });
    startRealtimeSync();
}

function switchToEditMode() {
    if (!currentNoteInModal) return;
    isEditMode = true;
    stopRealtimeSync();

    modalBody.innerHTML = '';
    modalBody.textContent = currentNoteInModal.rawContent;
    modalBody.contentEditable = true;

    modalTitle.classList.add('hidden');
    modalTitleInput.classList.remove('hidden');
    modalTitleInput.value = currentNoteInModal.path;

    modalEditBtn.innerHTML = '<i data-lucide="eye" class="h-5 w-5"></i>';
    lucide.createIcons({
        nodes: [modalEditBtn]
    });
    modalBody.focus();
}

async function saveNoteFromModal() {
    if (!currentNoteInModal) return;
    const newContent = modalBody.textContent;
    let newPath = modalTitleInput.value.trim();
    const oldPath = currentNoteInModal.path;

    if (!newPath) return;
    if (!newPath.toLowerCase().endsWith('.md')) newPath += '.md';

    try {
        await api.updateNote(oldPath, newPath, newContent);
        await checkForUpdates(true);

        const updatedNote = allNotes.find(n => n.path === newPath);
        if (updatedNote) {
            currentNoteInModal = updatedNote;
            modalTitle.textContent = currentNoteInModal.path.replace(/\.md$/, '');
            modalTitleInput.value = currentNoteInModal.path;
        } else {
            hideModal();
        }

    } catch (error) {
        console.error("Error saving note from modal:", error);
        alert("Failed to save note. Your changes may be lost.");
    }
}

function showStandardModal(note) {
    if (!note) return;
    currentNoteInModal = note;

    modalTitle.textContent = note.path.replace(/\.md$/, '');

    if (note.tags && note.tags.length > 0) {
        modalTags.innerHTML = note.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
        modalTags.classList.remove('hidden');
    } else {
        modalTags.classList.add('hidden');
    }

    switchToViewMode();

    noteModal.classList.remove('hidden');
    noteModal.classList.add('flex');
}

function hideModal() {
    if (isEditMode) switchToViewMode();
    noteModal.classList.add('hidden');
    noteModal.classList.remove('flex');
    modalBody.innerHTML = '';
    currentNoteInModal = null;
    isEditMode = false;
    startRealtimeSync();
}

function showMediaModal(note) {
    currentMediaNoteInModal = note;
    const data = note.tmdb_data;
    if (!data) return;

    const backdropUrl = data.backdrop_path ? `https://image.tmdb.org/t/p/original${data.backdrop_path}` : '';
    const posterUrl = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '[https://placehold.co/500x750/e2e8f0/4a5568?text=No+Poster](https://placehold.co/500x750/e2e8f0/4a5568?text=No+Poster)';

    mediaModalBackdrop.style.backgroundImage = `url('${backdropUrl}')`;
    mediaModalPoster.src = posterUrl;
    mediaModalPoster.alt = data.title || data.name;

    mediaModalTitle.textContent = data.title || data.name;

    const releaseDate = data.release_date || data.first_air_date;
    const year = releaseDate ? new Date(releaseDate).getFullYear() : '';
    const rating = data.vote_average ? data.vote_average.toFixed(1) + ' / 10' : 'Not Rated';
    const runtime = data.runtime ? `${Math.floor(data.runtime / 60)}h ${data.runtime % 60}m` : (data.episode_run_time && data.episode_run_time.length > 0 ? `${data.episode_run_time[0]} min` : '');

    let metaHTML = `<span>${year}</span>`;
    if (runtime) metaHTML += `<span>&bull; ${runtime}</span>`;
    metaHTML += `<span>&bull; <i data-lucide="star" class="inline w-4 h-4 -mt-1 text-yellow-400"></i> ${rating}</span>`;
    mediaModalMeta.innerHTML = metaHTML;

    mediaModalGenres.innerHTML = (data.genres || []).map(g => `<span class="media-modal-genre-tag">${g.name}</span>`).join('');
    mediaModalOverview.textContent = data.overview || 'No overview available.';

    mediaModal.classList.remove('hidden');
    mediaModal.classList.add('flex');
    lucide.createIcons();
}

function hideMediaModal() {
    mediaModal.classList.add('hidden');
    mediaModal.classList.remove('flex');
    currentMediaNoteInModal = null;
}

async function deleteMediaNote() {
    if (!currentMediaNoteInModal) return;

    if (window.confirm(`Are you sure you want to delete "${currentMediaNoteInModal.path}"?`)) {
        try {
            await api.deleteNote(currentMediaNoteInModal.path);
            updateNoteInState({
                path: currentMediaNoteInModal.path
            }, 'delete');
            hideMediaModal();
        } catch (error) {
            console.error(`Error deleting file: ${currentMediaNoteInModal.path}`, error);
            alert("Failed to delete note. See console for details.");
        }
    }
}

// --- Audio Modal Functions ---
function showAudioModal(note) {
    currentAudioNoteInModal = note;
    const relativePath = mediaPathMap.get(note.audioFileName);

    // Reset player state
    audioModalCD.classList.remove('playing');
    timelineProgress.style.width = '0%';
    currentTimeEl.textContent = '0:00';
    totalDurationEl.textContent = '0:00';
    playPauseBtn.innerHTML = '<i data-lucide="play" class="w-6 h-6 ml-1"></i>';
    lucide.createIcons({
        nodes: [playPauseBtn]
    });

    if (relativePath) {
        const audioUrl = `/api/media/${encodeURIComponent(relativePath)}`;
        audioModalPlayer.src = audioUrl;
    } else {
        audioModalPlayer.src = '';
        console.error(`Could not find path for audio file: ${note.audioFileName}`);
    }

    const titleParts = note.audioFileName.replace(/\.mp3$/i, '').split('-').map(word => word.trim());
    const title = titleParts.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    const artist = titleParts.length > 1 ? titleParts[0].toUpperCase() : 'Unknown Artist';

    audioModalTitle.textContent = title;
    audioModalArtist.textContent = artist;

    audioModal.classList.remove('hidden');
    audioModal.classList.add('flex');
    lucide.createIcons();
}

function hideAudioModal() {
    audioModal.classList.add('hidden');
    audioModal.classList.remove('flex');
    audioModalPlayer.pause();
    audioModalPlayer.src = '';
    currentAudioNoteInModal = null;
}

async function deleteAudioNote() {
    if (!currentAudioNoteInModal) return;

    if (window.confirm(`Are you sure you want to delete "${currentAudioNoteInModal.path}"?`)) {
        try {
            await api.deleteNote(currentAudioNoteInModal.path);
            updateNoteInState({
                path: currentAudioNoteInModal.path
            }, 'delete');
            hideAudioModal();
        } catch (error) {
            console.error(`Error deleting file: ${currentAudioNoteInModal.path}`, error);
            alert("Failed to delete note. See console for details.");
        }
    }
}

// --- Wikipedia Modal Functions ---
function showWikipediaModal(note) {
    currentWikipediaNoteInModal = note;
    const data = note.tmdb_data;
    
    // Extract Wikipedia URL from the note content (including different language versions)
    const wikipediaUrlMatch = note.rawContent.match(/https?:\/\/(?:www\.)?[a-z]{2}\.wikipedia\.org\/wiki\/[^\s\n]+/g);
    let wikipediaUrl = null;
    
    if (wikipediaUrlMatch && wikipediaUrlMatch.length > 0) {
        wikipediaUrl = wikipediaUrlMatch[wikipediaUrlMatch.length - 1]; // Get the last URL
    } else if (data && data.url) {
        wikipediaUrl = data.url; // Fallback to API data
    }
    
    if (!wikipediaUrl) return;

    // Set the title
    if (data && data.title) {
        wikipediaModalTitle.textContent = data.title + ' - Wikipedia';
    } else {
        // Extract title from URL if no API data
        const urlMatch = wikipediaUrl.match(/[a-z]{2}\.wikipedia\.org\/wiki\/([^/\s?#]+)/);
        if (urlMatch) {
            const title = urlMatch[1].replace(/_/g, ' ');
            wikipediaModalTitle.textContent = title + ' - Wikipedia';
        }
    }

    // Show tags if available
    if (note.tags && note.tags.length > 0) {
        wikipediaModalTags.innerHTML = note.tags.map(tag => `<span class="tag">${tag}</span>`).join('');
        wikipediaModalTags.classList.remove('hidden');
    } else {
        wikipediaModalTags.classList.add('hidden');
    }

    // Clear the iframe first to prevent caching issues
    wikipediaIframe.src = '';
    
    // Load the Wikipedia article in the iframe using the actual URL from the note
    setTimeout(() => {
        wikipediaIframe.src = wikipediaUrl;
    }, 100);

    // Switch to view mode
    switchToWikipediaViewMode();

    wikipediaModal.classList.remove('hidden');
    wikipediaModal.classList.add('flex');
    lucide.createIcons();
}

// --- Chat Modal Functions ---
function showChatModal() {
    chatModal.classList.remove('hidden');
    setTimeout(() => {
        chatModal.classList.add('visible');
        chatInput.focus();
    }, 10);
}

function hideChatModal() {
    chatModal.classList.remove('visible');
    setTimeout(() => {
        chatModal.classList.add('hidden');
    }, 300);
}

async function sendChatMessage() {
    const question = chatInput.value.trim();
    if (!question) return;

    appendMessage(question, 'user');
    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    const eventSource = new EventSource(`/api/chat?question=${encodeURIComponent(question)}`);

    let assistantMessageDiv = appendMessage('', 'assistant');
    let messageContentDiv = assistantMessageDiv.querySelector('.chat-message-content');

    eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);

        if (data.token) {
            messageContentDiv.innerHTML += data.token;
        }
        if (data.sources) {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'chat-message-sources';
            const sourcesHTML = data.sources.map(source => 
                `<a href="#" class="source-link" data-path="${source}">${source}</a>`
            ).join(', ');
            sourcesDiv.innerHTML = `<strong>Sources:</strong> ${sourcesHTML}`;
            chatMessages.appendChild(sourcesDiv);
            lucide.createIcons();
        }
        if (data.error) {
            messageContentDiv.innerHTML = data.error;
            eventSource.close();
            chatInput.disabled = false;
            chatSendBtn.disabled = false;
            chatInput.focus();
        }
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };

    eventSource.onerror = function(err) {
        console.error("EventSource failed:", err);
        eventSource.close();
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
    };
}

function appendMessage(text, sender, sources = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'chat-avatar';
    avatarDiv.innerHTML = `<i data-lucide="${sender === 'user' ? 'user' : 'brain-circuit'}" class="w-5 h-5"></i>`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';
    contentDiv.innerHTML = marked.parse(text);

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);

    chatMessages.appendChild(messageDiv);

    if (sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'chat-message-sources';
        const sourcesHTML = sources.map(source => 
            `<a href="#" class="source-link" data-path="${source}">${source}</a>`
        ).join(', ');
        sourcesDiv.innerHTML = `<strong>Sources:</strong> ${sourcesHTML}`;
        chatMessages.appendChild(sourcesDiv);
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
    lucide.createIcons();
    return messageDiv; // Return the message div so we can append to it
}


function switchToWikipediaViewMode() {
    if (!currentWikipediaNoteInModal) return;
    isWikipediaEditMode = false;

    wikipediaModalTitle.classList.remove('hidden');
    wikipediaModalTitleInput.classList.add('hidden');
    wikipediaModalEditBtn.innerHTML = '<i data-lucide="file-pen-line" class="h-5 w-5"></i>';
    lucide.createIcons({
        nodes: [wikipediaModalEditBtn]
    });
}

function switchToWikipediaEditMode() {
    if (!currentWikipediaNoteInModal) return;
    isWikipediaEditMode = true;

    wikipediaModalTitle.classList.add('hidden');
    wikipediaModalTitleInput.classList.remove('hidden');
    wikipediaModalTitleInput.value = currentWikipediaNoteInModal.path;

    wikipediaModalEditBtn.innerHTML = '<i data-lucide="eye" class="h-5 w-5"></i>';
    lucide.createIcons({
        nodes: [wikipediaModalEditBtn]
    });
    wikipediaModalTitleInput.focus();
}

function hideWikipediaModal() {
    if (isWikipediaEditMode) switchToWikipediaViewMode();
    wikipediaModal.classList.add('hidden');
    wikipediaModal.classList.remove('flex');
    // Clear the iframe to prevent caching issues
    wikipediaIframe.src = '';
    currentWikipediaNoteInModal = null;
    isWikipediaEditMode = false;
}

async function deleteWikipediaNote() {
    if (!currentWikipediaNoteInModal) return;

    if (window.confirm(`Are you sure you want to delete "${currentWikipediaNoteInModal.path}"?`)) {
        try {
            await api.deleteNote(currentWikipediaNoteInModal.path);
            updateNoteInState({
                path: currentWikipediaNoteInModal.path
            }, 'delete');
            hideWikipediaModal();
        } catch (error) {
            console.error(`Error deleting file: ${currentWikipediaNoteInModal.path}`, error);
            alert("Failed to delete note. See console for details.");
        }
    }
}

// --- Custom Audio Player Logic ---
function initializeCustomPlayer() {
    playPauseBtn.addEventListener('click', () => {
        if (audioModalPlayer.paused) {
            audioModalPlayer.play();
        } else {
            audioModalPlayer.pause();
        }
    });

    audioModalPlayer.addEventListener('play', () => {
        playPauseBtn.innerHTML = '<i data-lucide="pause" class="w-6 h-6"></i>';
        lucide.createIcons({
            nodes: [playPauseBtn]
        });
        audioModalCD.classList.add('playing');
    });
    audioModalPlayer.addEventListener('pause', () => {
        playPauseBtn.innerHTML = '<i data-lucide="play" class="w-6 h-6 ml-1"></i>';
        lucide.createIcons({
            nodes: [playPauseBtn]
        });
        audioModalCD.classList.remove('playing');
    });

    audioModalPlayer.addEventListener('timeupdate', () => {
        const {
            currentTime,
            duration
        } = audioModalPlayer;
        if (duration) {
            const progressPercent = (currentTime / duration) * 100;
            timelineProgress.style.width = `${progressPercent}%`;
            currentTimeEl.textContent = formatTime(currentTime);
        }
    });

    audioModalPlayer.addEventListener('loadedmetadata', () => {
        totalDurationEl.textContent = formatTime(audioModalPlayer.duration);
    });

    timelineContainer.addEventListener('click', (e) => {
        const timelineWidth = timelineContainer.clientWidth;
        const clickX = e.offsetX;
        const duration = audioModalPlayer.duration;
        if (duration) {
            audioModalPlayer.currentTime = (clickX / timelineWidth) * duration;
        }
    });

    audioModalPlayer.addEventListener('ended', () => {
        playPauseBtn.innerHTML = '<i data-lucide="play" class="w-6 h-6 ml-1"></i>';
        lucide.createIcons({
            nodes: [playPauseBtn]
        });
        timelineProgress.style.width = '0%';
        audioModalPlayer.currentTime = 0;
        audioModalCD.classList.remove('playing');
    });
}

// --- Event Listeners ---
importBtn.addEventListener('click', () => checkForUpdates(true));
searchInput.addEventListener('input', debounce(applyFilters, 300));

// MODIFIED: New note modal listeners for seamless editing
addNoteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    showNewNoteModal();
});
newNoteCloseBtn.addEventListener('click', hideNewNoteModal);
newNoteSaveBtn.addEventListener('click', createNewNoteFromModal);
newNoteTitle.addEventListener('input', updateNewNoteSaveButtonState);

// Chat modal listeners
chatBtn.addEventListener('click', (e) => {
    e.preventDefault();
    showChatModal();
});

chatCloseBtn.addEventListener('click', hideChatModal);
chatSendBtn.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage();
    }
});

chatMessages.addEventListener('click', (e) => {
    const target = e.target.closest('.source-link');
    if (target) {
        e.preventDefault();
        const notePath = target.dataset.path;
        const note = allNotes.find(n => n.path.endsWith(notePath));
        if (note) {
            showStandardModal(note);
        }
    }
});

// Seamless editing logic
newNoteTitle.addEventListener('keydown', (e) => {
    // On Enter, move to content field
    if (e.key === 'Enter') {
        e.preventDefault();
        newNoteContent.focus();
    }
});

newNoteContent.addEventListener('keydown', (e) => {
    // On Backspace in an empty content field, move back to title
    if (e.key === 'Backspace' && newNoteContent.value === '') {
        e.preventDefault();
        newNoteTitle.focus();
    }
});

// Dynamic placeholder for content area
newNoteContent.addEventListener('focus', () => {
    newNoteContent.placeholder = '';
});
newNoteContent.addEventListener('blur', () => {
    newNoteContent.placeholder = '';
});

// ADDED: Shortcuts popup logic
shortcutsHelpBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent the window click listener from firing immediately
    shortcutsPopup.classList.toggle('hidden');
});

// ADDED: Hide shortcuts popup when clicking anywhere else
window.addEventListener('click', (e) => {
    if (!shortcutsPopup.classList.contains('hidden')) {
        if (!shortcutsPopup.contains(e.target) && e.target !== shortcutsHelpBtn) {
            shortcutsPopup.classList.add('hidden');
        }
    }
});


modalEditBtn.addEventListener('click', () => {
    isEditMode ? switchToViewMode() : switchToEditMode();
});
modalDeleteBtn.addEventListener('click', deleteNote);
modalCloseBtn.addEventListener('click', hideModal);
noteModal.addEventListener('click', (e) => {
    if (e.target === noteModal) hideModal();
});

mediaModalCloseBtn.addEventListener('click', hideMediaModal);
mediaModalDeleteBtn.addEventListener('click', deleteMediaNote);
mediaModal.addEventListener('click', (e) => {
    if (e.target === mediaModal) hideMediaModal();
});

audioModalCloseBtn.addEventListener('click', hideAudioModal);
audioModalDeleteBtn.addEventListener('click', deleteAudioNote);
audioModal.addEventListener('click', (e) => {
    if (e.target === audioModal) hideAudioModal();
});

wikipediaModalCloseBtn.addEventListener('click', hideWikipediaModal);
wikipediaModalDeleteBtn.addEventListener('click', deleteWikipediaNote);
wikipediaModalEditBtn.addEventListener('click', () => {
    isWikipediaEditMode ? switchToWikipediaViewMode() : switchToWikipediaEditMode();
});
wikipediaModal.addEventListener('click', (e) => {
    if (e.target === wikipediaModal) hideWikipediaModal();
});

folderTagsContainer.addEventListener('click', (e) => {
    const clickedTag = e.target.closest('.folder-tag');
    if (!clickedTag) return;

    folderTagsContainer.querySelectorAll('.folder-tag').forEach(tag => tag.classList.remove('active'));
    clickedTag.classList.add('active');

    const folderName = clickedTag.dataset.folder;
    activeFolderFilter = (folderName === 'all') ? null : folderName;

    applyFilters();
});

const autoSaveHandler = () => {
    if (isEditMode) {
        if (autoSaveTimer) clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(saveNoteFromModal, 1500);
    }
};

modalBody.addEventListener('input', autoSaveHandler);
modalTitleInput.addEventListener('input', autoSaveHandler);

function handleInternalLinkClick(e) {
    if (e.target.classList.contains('internal-link')) {
        e.preventDefault();
        const linkName = e.target.dataset.linkName;

        const targetNote = allNotes.find(note => {
            const noteTitle = note.path.split(/[\\/]/).pop().replace(/\.md$/, '');
            return noteTitle.toLowerCase() === linkName.toLowerCase();
        });

        if (targetNote) {
            hideModal();
            hideMediaModal();
            hideAudioModal();
            hideWikipediaModal();
            if (targetNote.isAudioNote) {
                showAudioModal(targetNote);
            } else if (targetNote.isMediaNote && targetNote.media_type === 'wikipedia') {
                showWikipediaModal(targetNote);
            } else if (targetNote.isMediaNote && targetNote.tmdb_data) {
                showMediaModal(targetNote);
            } else {
                showStandardModal(targetNote);
            }
        } else {
            searchInput.value = linkName;
            applyFilters();
            hideModal();
            hideMediaModal();
            hideAudioModal();
            hideWikipediaModal();
        }
    }
}

cardContainer.addEventListener('click', (e) => {
    const cardElement = e.target.closest('.card, .card-placeholder, .audio-card');
    if (cardElement && !e.target.classList.contains('internal-link')) {
        const noteId = cardElement.dataset.id;
        const noteData = allNotes.find(n => n.id === noteId);

        if (!noteData) return;

        if (noteData.isAudioNote) {
            showAudioModal(noteData);
        } else if (noteData.isMediaNote && noteData.media_type === 'wikipedia') {
            showWikipediaModal(noteData);
        } else if (noteData.isMediaNote && noteData.tmdb_data) {
            showMediaModal(noteData);
        } else if (!noteData.isMediaNote) {
            showStandardModal(noteData);
        } else if (noteData.isMediaNote && !noteData.tmdb_data) {
            showStandardModal(noteData);
        }
    }
    handleInternalLinkClick(e);
});

modalBody.addEventListener('click', handleInternalLinkClick);

modalBody.addEventListener('change', async (e) => {
    if (!isEditMode && e.target.matches('input[type="checkbox"]')) {
        const notePath = currentNoteInModal.path;
        const note = allNotes.find(n => n.path === notePath);
        if (!note) return;

        const checkboxes = Array.from(modalBody.querySelectorAll('input[type="checkbox"]'));
        const clickedIndex = checkboxes.indexOf(e.target);
        const isChecked = e.target.checked;

        let taskCounter = -1;
        const newContent = note.rawContent.split('\n').map(line => {
            if (/^\s*- \[[ x]\]/.test(line)) {
                taskCounter++;
                if (taskCounter === clickedIndex) {
                    return line.replace(/\[[ x]\]/, isChecked ? '[x]' : '[ ]');
                }
            }
            return line;
        }).join('\n');

        await api.updateNote(note.path, note.path, newContent);
        updateNoteInState({
            path: note.path,
            rawContent: newContent
        });
    }
});

document.addEventListener('keydown', (e) => {
    // Handle new note modal shortcuts
    if (newNoteModal.classList.contains('visible')) {
        if (e.key === 'Escape') {
            hideNewNoteModal();
        } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            createNewNoteFromModal();
        }
        return; // Prevent other shortcuts from firing
    }

    // Handle other modals
    if (e.key === "Escape") {
        hideModal();
        hideMediaModal();
        hideAudioModal();
        hideWikipediaModal();
    }
});

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', initialize);