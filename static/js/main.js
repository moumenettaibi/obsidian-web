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

// Search Help Modal Elements
const searchHelpBtn = document.getElementById('search-help-btn');
const searchHelpModal = document.getElementById('search-help-modal');
const searchHelpCloseBtn = document.getElementById('search-help-close-btn');

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
    return function (...args) {
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
            const processedNote = {
                ...note,
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


// --- Table Action Functions ---
function wrapTablesWithActions(htmlContent) {
    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Find all tables and wrap them
    const tables = tempDiv.querySelectorAll('table');
    tables.forEach((table, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-container';
        wrapper.dataset.tableIndex = index;

        const actions = document.createElement('div');
        actions.className = 'table-actions';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'table-action-btn copy-btn';
        copyBtn.title = 'Copy as Markdown';
        copyBtn.innerHTML = '<i data-lucide="copy" class="w-4 h-4"></i>';
        copyBtn.dataset.action = 'copy';
        copyBtn.dataset.tableIndex = index;

        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'table-action-btn download-btn';
        downloadBtn.title = 'Download as CSV';
        downloadBtn.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i>';
        downloadBtn.dataset.action = 'download';
        downloadBtn.dataset.tableIndex = index;

        actions.appendChild(copyBtn);
        actions.appendChild(downloadBtn);

        // Insert wrapper before table
        table.parentNode.insertBefore(wrapper, table);
        // Move table into wrapper
        wrapper.appendChild(table);
        // Add actions to wrapper
        wrapper.appendChild(actions);
    });

    return tempDiv.innerHTML;
}

function copyTableAsMarkdown(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    let markdown = '';

    rows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        const cellTexts = cells.map(cell => cell.textContent.trim());

        // Add table row
        markdown += '| ' + cellTexts.join(' | ') + ' |\n';

        // Add separator after header row
        if (rowIndex === 0 && row.querySelector('th')) {
            markdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
        }
    });

    // Copy to clipboard
    navigator.clipboard.writeText(markdown).then(() => {
        showCopyFeedback(table);
    }).catch(err => {
        console.error('Failed to copy table:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = markdown;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showCopyFeedback(table);
    });
}

function downloadTableAsCSV(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    let csv = '';

    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        const cellTexts = cells.map(cell => {
            let text = cell.textContent.trim();
            // Escape quotes and wrap in quotes if contains comma or quote
            if (text.includes(',') || text.includes('"') || text.includes('\n')) {
                text = '"' + text.replace(/"/g, '""') + '"';
            }
            return text;
        });
        csv += cellTexts.join(',') + '\n';
    });

    // Create and download file
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `table-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function showCopyFeedback(table) {
    const wrapper = table.closest('.table-container');
    const copyBtn = wrapper.querySelector('.copy-btn');

    copyBtn.classList.add('copied');
    copyBtn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i>';

    setTimeout(() => {
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = '<i data-lucide="copy" class="w-4 h-4"></i>';
        lucide.createIcons({ nodes: [copyBtn] });
    }, 2000);
}

// Function to initialize table action icons after content is rendered
function initializeTableIcons(container) {
    const tableContainers = container.querySelectorAll('.table-container');
    tableContainers.forEach(tableContainer => {
        lucide.createIcons({ nodes: [tableContainer] });
    });
}

// --- Code Block Enhancement Functions ---
function enhanceCodeBlocks(htmlContent) {
    // Create a temporary div to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Find all pre > code elements (code blocks)
    const codeBlocks = tempDiv.querySelectorAll('pre > code');
    codeBlocks.forEach((codeElement, index) => {
        const preElement = codeElement.parentElement;

        // Extract language from class (e.g., "language-javascript")
        let language = 'text';
        const classList = Array.from(codeElement.classList);
        const languageClass = classList.find(cls => cls.startsWith('language-'));
        if (languageClass) {
            language = languageClass.replace('language-', '');
        }

        // Get the code content
        const codeContent = codeElement.textContent;

        // Create enhanced code block container
        const container = document.createElement('div');
        container.className = 'code-block-container';
        container.dataset.codeIndex = index;

        // Store the original code content for copying (without HTML)
        container.dataset.originalCode = codeContent;

        // Create header with language and copy button
        const header = document.createElement('div');
        header.className = 'code-block-header';

        const languageLabel = document.createElement('div');
        languageLabel.className = 'code-block-language';
        languageLabel.textContent = language || 'text';

        const copyBtn = document.createElement('button');
        copyBtn.className = 'code-copy-btn';
        copyBtn.innerHTML = '<i data-lucide="copy" class="w-3 h-3"></i><span>Copy</span>';
        copyBtn.dataset.action = 'copy-code';
        copyBtn.dataset.codeIndex = index;

        header.appendChild(languageLabel);
        header.appendChild(copyBtn);

        // Create content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'code-block-content';

        // Apply syntax highlighting
        const highlightedCode = applySyntaxHighlighting(codeContent, language);

        // Create new pre and code elements
        const newPre = document.createElement('pre');
        const newCode = document.createElement('code');
        newCode.innerHTML = highlightedCode;
        newPre.appendChild(newCode);
        contentWrapper.appendChild(newPre);

        // Assemble the enhanced code block
        container.appendChild(header);
        container.appendChild(contentWrapper);

        // Replace the original pre element
        preElement.parentNode.insertBefore(container, preElement);
        preElement.remove();
    });

    return tempDiv.innerHTML;
}

function applySyntaxHighlighting(code, language) {
    // Simple, reliable syntax highlighting
    const lines = code.split('\n');
    const highlightedLines = lines.map(line => highlightLine(line, language));
    return highlightedLines.join('\n');
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function highlightLine(line, language) {
    // Escape HTML first
    let result = escapeHtml(line);

    // Apply simple highlighting based on language
    switch (language.toLowerCase()) {
        case 'python':
        case 'py':
            return highlightPythonLine(result);
        case 'javascript':
        case 'js':
            return highlightJavaScriptLine(result);
        case 'css':
            return highlightCSSLine(result);
        case 'html':
            return highlightHTMLLine(result);
        case 'json':
            return highlightJSONLine(result);
        case 'bash':
        case 'shell':
        case 'sh':
            return highlightBashLine(result);
        default:
            return result;
    }
}

function highlightPythonLine(line) {
    // Keywords
    line = line.replace(/\b(def|class|if|elif|else|for|while|try|except|finally|with|as|import|from|return|yield|break|continue|pass|lambda|and|or|not|in|is|None|True|False|self|cls)\b/g, '<span class="token keyword">$1</span>');

    // Strings
    line = line.replace(/(&quot;)([^&]*?)(&quot;)/g, '<span class="token string">$1$2$3</span>');
    line = line.replace(/(&#39;)([^&]*?)(&#39;)/g, '<span class="token string">$1$2$3</span>');

    // Numbers
    line = line.replace(/\b(\d+\.?\d*)\b/g, '<span class="token number">$1</span>');

    // Comments
    line = line.replace(/(#.*$)/g, '<span class="token comment">$1</span>');

    return line;
}

function highlightJavaScriptLine(line) {
    // Keywords
    line = line.replace(/\b(const|let|var|function|return|if|else|for|while|do|break|continue|switch|case|default|try|catch|finally|throw|class|extends|import|export|from|async|await|new|this|super|static|get|set|typeof|instanceof|in|of|delete|void|null|undefined|true|false)\b/g, '<span class="token keyword">$1</span>');

    // Strings
    line = line.replace(/(&quot;)([^&]*?)(&quot;)/g, '<span class="token string">$1$2$3</span>');
    line = line.replace(/(&#39;)([^&]*?)(&#39;)/g, '<span class="token string">$1$2$3</span>');

    // Numbers
    line = line.replace(/\b(\d+\.?\d*)\b/g, '<span class="token number">$1</span>');

    // Comments
    line = line.replace(/(\/\/.*$)/g, '<span class="token comment">$1</span>');

    return line;
}

function highlightCSSLine(line) {
    // Properties (simple pattern)
    line = line.replace(/([a-zA-Z-]+)(\s*:)/g, '<span class="token property">$1</span>$2');

    // Comments
    line = line.replace(/(\/\*.*?\*\/)/g, '<span class="token comment">$1</span>');

    return line;
}

function highlightHTMLLine(line) {
    // Only highlight angle brackets, keep tag names normal
    line = line.replace(/(&lt;\/?)([a-zA-Z][a-zA-Z0-9]*)/g, '<span class="token punctuation">$1</span>$2');
    line = line.replace(/(&gt;)/g, '<span class="token punctuation">$1</span>');

    // Attributes
    line = line.replace(/([a-zA-Z-]+)(=)(&quot;[^&]*?&quot;)/g, '<span class="token attr-name">$1</span><span class="token punctuation">$2</span><span class="token attr-value">$3</span>');

    return line;
}

function highlightJSONLine(line) {
    // Strings
    line = line.replace(/(&quot;)([^&]*?)(&quot;)/g, '<span class="token string">$1$2$3</span>');

    // Numbers
    line = line.replace(/:\s*(\d+\.?\d*)/g, ': <span class="token number">$1</span>');

    // Booleans and null
    line = line.replace(/\b(true|false|null)\b/g, '<span class="token boolean">$1</span>');

    return line;
}

function highlightBashLine(line) {
    // Commands starting with $
    line = line.replace(/^(\$\s*)([a-zA-Z-]+)/g, '$1<span class="token function">$2</span>');

    // Flags
    line = line.replace(/(\s)(--?[a-zA-Z-]+)/g, '$1<span class="token property">$2</span>');

    // Comments
    line = line.replace(/(#.*$)/g, '<span class="token comment">$1</span>');

    return line;
}

function copyCodeToClipboard(codeIndex) {
    const container = document.querySelector(`[data-code-index="${codeIndex}"]`);
    if (!container) return;

    // Get the original code content (stored as data attribute)
    const codeText = container.dataset.originalCode;
    if (!codeText) return;

    // Copy to clipboard
    navigator.clipboard.writeText(codeText).then(() => {
        showCodeCopyFeedback(container);
    }).catch(err => {
        console.error('Failed to copy code:', err);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = codeText;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showCodeCopyFeedback(container);
    });
}

function showCodeCopyFeedback(container) {
    const copyBtn = container.querySelector('.code-copy-btn');
    if (!copyBtn) {
        console.log('Copy button not found');
        return;
    }

    console.log('Showing copy feedback, adding copied class');
    console.log('Button element:', copyBtn);
    console.log('Current computed styles:', window.getComputedStyle(copyBtn).background);

    // Store original styles
    const originalBackground = copyBtn.style.background;
    const originalBorderColor = copyBtn.style.borderColor;
    const originalColor = copyBtn.style.color;

    // Add copied state with green styling using setAttribute for maximum compatibility
    copyBtn.classList.add('copied');
    copyBtn.innerHTML = '<i data-lucide="check" class="w-3 h-3"></i><span>Copied!</span>';

    // Force styles with !important using cssText
    copyBtn.style.cssText += `
        background: #10b981 !important;
        border-color: #059669 !important;
        color: #ffffff !important;
        transform: translateY(-1px) !important;
    `;

    console.log('After styling:', window.getComputedStyle(copyBtn).background);

    // Initialize the check icon
    lucide.createIcons({ nodes: [copyBtn] });

    // Reset after 2.5 seconds
    setTimeout(() => {
        console.log('Resetting copy button');
        copyBtn.classList.remove('copied');
        copyBtn.innerHTML = '<i data-lucide="copy" class="w-3 h-3"></i><span>Copy</span>';

        // Reset to original styles
        copyBtn.style.background = originalBackground;
        copyBtn.style.borderColor = originalBorderColor;
        copyBtn.style.color = originalColor;
        copyBtn.style.transform = '';

        lucide.createIcons({ nodes: [copyBtn] });
    }, 2500);
}

// Function to initialize code block icons after content is rendered
function initializeCodeBlockIcons(container) {
    const codeContainers = container.querySelectorAll('.code-block-container');
    codeContainers.forEach(codeContainer => {
        lucide.createIcons({ nodes: [codeContainer] });
    });
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

    // Process hex colors - match #followed by 3 or 6 hex digits
    processedContent = processedContent.replace(/#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})\b/g, (match, hexValue) => {
        // Normalize 3-digit hex to 6-digit
        const normalizedHex = hexValue.length === 3
            ? hexValue.split('').map(char => char + char).join('')
            : hexValue;

        return `<span class="hex-color-preview">
            <span class="hex-color-swatch" style="background-color: #${normalizedHex};"></span>
            <span class="hex-color-text">#${hexValue.toUpperCase()}</span>
        </span>`;
    });

    const parsedContent = marked.parse(processedContent);

    // Wrap tables with action buttons and enhance code blocks after parsing
    const contentWithTables = wrapTablesWithActions(parsedContent);
    return enhanceCodeBlocks(contentWithTables);
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
    // Initialize table action icons
    initializeTableIcons(div);

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
            const updatedNote = {
                ...allNotes[noteIndex],
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
            allNotes = serverNotes.map(note => ({
                ...note,
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
    // Initialize table and code block action icons
    initializeTableIcons(modalBody);
    initializeCodeBlockIcons(modalBody);

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
        
        // Show welcome message if chat is empty
        if (chatMessages.children.length === 0) {
            showWelcomeMessage();
        }
    }, 10);
}

function showWelcomeMessage() {
    const welcomeMessages = [
        "Hey! I'm your personal AI assistant. I know everything about your notes and can help you find anything you're looking for. What's on your mind?",
        "Hi there! I've got access to all your notes and I'm here to help. Want to search for something specific or just chat?",
        "Hello! I'm here to help you navigate your knowledge base. I can find your latest notes, search for specific topics, or just have a conversation. What would you like to do?",
        "Hey! Ready to explore your notes together? I can help you find that movie you saved, your latest book notes, or anything else you're looking for."
    ];
    
    const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
    
    setTimeout(() => {
        appendMessage(randomMessage, 'assistant');
        addConversationSuggestions();
    }, 500);
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

    // Enhanced user message with better styling
    appendMessage(question, 'user');
    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    // Show typing indicator
    const typingIndicator = showTypingIndicator();

    try {
        const eventSource = new EventSource(`/api/chat?question=${encodeURIComponent(question)}`);

        let assistantMessageDiv = null;
        let messageContentDiv = null;
        let currentResponse = '';

        eventSource.onmessage = function (event) {
            const data = JSON.parse(event.data);

            if (data.token) {
                // Remove typing indicator when first token arrives
                if (typingIndicator && typingIndicator.parentNode) {
                    typingIndicator.remove();
                }

                // Create assistant message if it doesn't exist
                if (!assistantMessageDiv) {
                    assistantMessageDiv = appendMessage('', 'assistant');
                    messageContentDiv = assistantMessageDiv.querySelector('.chat-message-content');
                }

                currentResponse += data.token;
                
                // Enhanced markdown rendering with better formatting
                const renderedContent = enhanceCodeBlocks(wrapTablesWithActions(marked.parse(currentResponse)));
                messageContentDiv.innerHTML = renderedContent;
                
                // Re-initialize icons for any new content
                initializeTableIcons(messageContentDiv);
                initializeCodeBlockIcons(messageContentDiv);
                lucide.createIcons({ nodes: [messageContentDiv] });
            }

            if (data.sources && data.sources.length > 0) {
                // Simple sources display
                const sourcesDiv = document.createElement('div');
                sourcesDiv.className = 'chat-message-sources';
                
                const sourcesHTML = data.sources.map(source => {
                    const fileName = source.split('/').pop();
                    return `<button class="source-link" data-path="${source}" onclick="openNoteFromChat('${source}', event)">${fileName}</button>`;
                }).join(', ');
                
                sourcesDiv.innerHTML = `<strong>Sources:</strong> ${sourcesHTML}`;
                
                chatMessages.appendChild(sourcesDiv);
                lucide.createIcons({ nodes: [sourcesDiv] });
            }

            if (data.done) {
                eventSource.close();
                chatInput.disabled = false;
                chatSendBtn.disabled = false;
                chatInput.focus();
                
                // Add conversation suggestions
                addConversationSuggestions();
            }

            if (data.error) {
                if (typingIndicator && typingIndicator.parentNode) {
                    typingIndicator.remove();
                }
                
                const errorDiv = appendMessage(`Sorry, I encountered an error: ${data.error}`, 'assistant');
                errorDiv.classList.add('error-message');
                
                eventSource.close();
                chatInput.disabled = false;
                chatSendBtn.disabled = false;
                chatInput.focus();
            }

            chatMessages.scrollTop = chatMessages.scrollHeight;
        };

        eventSource.onerror = function (err) {
            console.error("EventSource failed:", err);
            
            if (typingIndicator && typingIndicator.parentNode) {
                typingIndicator.remove();
            }
            
            appendMessage("Sorry, I'm having trouble connecting. Please try again.", 'assistant');
            
            eventSource.close();
            chatInput.disabled = false;
            chatSendBtn.disabled = false;
            chatInput.focus();
        };

    } catch (error) {
        console.error("Chat error:", error);
        
        if (typingIndicator && typingIndicator.parentNode) {
            typingIndicator.remove();
        }
        
        appendMessage("Sorry, something went wrong. Please try again.", 'assistant');
        
        chatInput.disabled = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
    }
}

function appendMessage(text, sender, sources = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'chat-avatar';
    avatarDiv.innerHTML = `<i data-lucide="${sender === 'user' ? 'user' : 'brain-circuit'}" class="w-5 h-5"></i>`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';
    
    if (text) {
        contentDiv.innerHTML = enhanceCodeBlocks(wrapTablesWithActions(marked.parse(text)));
    }

    messageDiv.appendChild(avatarDiv);
    messageDiv.appendChild(contentDiv);

    chatMessages.appendChild(messageDiv);

    if (sources.length > 0) {
        const sourcesDiv = document.createElement('div');
        sourcesDiv.className = 'chat-message-sources';
        const sourcesHTML = sources.map(source => {
            const fileName = source.split('/').pop();
            return `<button class="source-link" data-path="${source}" onclick="openNoteFromChat('${source}', event)">${fileName}</button>`;
        }).join(', ');
        sourcesDiv.innerHTML = `<strong>Sources:</strong> ${sourcesHTML}`;
        chatMessages.appendChild(sourcesDiv);
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
    lucide.createIcons();
    // Initialize table and code block icons for chat messages
    initializeTableIcons(contentDiv);
    initializeCodeBlockIcons(contentDiv);
    return messageDiv; // Return the message div so we can append to it
}

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message assistant';
    typingDiv.id = 'typing-indicator';

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'chat-avatar';
    avatarDiv.innerHTML = `<i data-lucide="brain-circuit" class="w-5 h-5"></i>`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'chat-message-content';
    contentDiv.innerHTML = `
        <div class="flex items-center space-x-1">
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
            <div class="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
        </div>
    `;

    typingDiv.appendChild(avatarDiv);
    typingDiv.appendChild(contentDiv);
    chatMessages.appendChild(typingDiv);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
    lucide.createIcons({ nodes: [typingDiv] });
    
    return typingDiv;
}

function addConversationSuggestions() {
    // Only add suggestions if there aren't many messages yet
    if (chatMessages.children.length > 10) return;

    const suggestionsDiv = document.createElement('div');
    suggestionsDiv.className = 'conversation-suggestions';
    
    const suggestions = [
        "What's my latest note?",
        "Show me my recent movies",
        "Find notes about books",
        "What did I clip yesterday?",
        "Search my audio notes"
    ];

    const suggestionsHTML = suggestions.map(suggestion => 
        `<button class="suggestion-btn" onclick="useSuggestion('${suggestion}')">${suggestion}</button>`
    ).join('');

    suggestionsDiv.innerHTML = `
        <div class="text-xs text-gray-500 mb-2">Try asking:</div>
        <div>${suggestionsHTML}</div>
    `;

    chatMessages.appendChild(suggestionsDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function useSuggestion(suggestion) {
    chatInput.value = suggestion;
    chatInput.focus();
    // Remove suggestions after use
    const suggestionsDiv = document.querySelector('.conversation-suggestions');
    if (suggestionsDiv) {
        suggestionsDiv.remove();
    }
}

async function openNoteFromChat(notePath, event) {
    // Prevent any event bubbling that might interfere
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    // Find the note in allNotes and open it
    const note = allNotes.find(n => n.path === notePath);
    
    if (note) {
        // If it's a media note without tmdb_data, load it first
        if (note.isMediaNote && !note.tmdb_data && note.title_slug) {
            try {
                if (note.media_type === 'wikipedia') {
                    // Handle Wikipedia notes
                    const wikipediaMatch = note.rawContent.match(/[a-z]{2}\.wikipedia\.org\/wiki\/([^/\s]+)/);
                    if (wikipediaMatch) {
                        const articleSlug = wikipediaMatch[1];
                        const data = await api.getWikipediaDetails(articleSlug);
                        if (data) {
                            note.tmdb_data = data;
                        }
                    }
                } else {
                    // Handle movie/TV show notes
                    const data = await api.getTMDbDetails(note.media_type, note.title_slug);
                    if (data) {
                        note.tmdb_data = data;
                    }
                }
            } catch (error) {
                console.error('Error loading media data:', error);
            }
        }
        
        // Now use the same logic as the card click handler to determine which modal to show
        if (note.isAudioNote) {
            showAudioModal(note);
        } else if (note.isMediaNote && note.media_type === 'wikipedia') {
            showWikipediaModal(note);
        } else if (note.isMediaNote && note.tmdb_data) {
            showMediaModal(note);
        } else if (!note.isMediaNote) {
            showStandardModal(note);
        } else if (note.isMediaNote && !note.tmdb_data) {
            // Fallback to standard modal if we couldn't load media data
            showStandardModal(note);
        }
    }
}

// --- Search Help Modal Functions ---
function showSearchHelpModal() {
    searchHelpModal.classList.remove('hidden');
    searchHelpModal.classList.add('flex');
}

function hideSearchHelpModal() {
    searchHelpModal.classList.add('hidden');
    searchHelpModal.classList.remove('flex');
}

// --- New Note Modal Functions ---
function showNewNoteModal() {
    newNoteModal.classList.add('visible');
    setTimeout(() => {
        newNoteTitle.focus();
    }, 100);
}

function hideNewNoteModal() {
    newNoteModal.classList.remove('visible');
    newNoteTitle.value = '';
    newNoteContent.value = '';
    updateNewNoteSaveButtonState();
}

function updateNewNoteSaveButtonState() {
    const hasTitle = newNoteTitle.value.trim().length > 0;
    newNoteSaveBtn.disabled = !hasTitle || !isDataLoaded;
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

// Search help modal listeners
searchHelpBtn.addEventListener('click', (e) => {
    e.preventDefault();
    showSearchHelpModal();
});

searchHelpCloseBtn.addEventListener('click', hideSearchHelpModal);

// Table action event delegation
document.addEventListener('click', (e) => {
    if (e.target.closest('.table-action-btn')) {
        const btn = e.target.closest('.table-action-btn');
        const action = btn.dataset.action;
        const tableIndex = btn.dataset.tableIndex;

        // Find the table associated with this button
        const tableContainer = btn.closest('.table-container');
        const table = tableContainer.querySelector('table');

        if (action === 'copy') {
            copyTableAsMarkdown(table);
        } else if (action === 'download') {
            downloadTableAsCSV(table);
        }
    }

    // Code copy event delegation
    if (e.target.closest('.code-copy-btn')) {
        const btn = e.target.closest('.code-copy-btn');
        const codeIndex = btn.dataset.codeIndex;
        copyCodeToClipboard(codeIndex);
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
        hideSearchHelpModal();
    }
});

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', initialize);
//
// --- Add Note Modal Functions ---
function showNewNoteModal() {
    newNoteModal.classList.remove('hidden');
    newNoteModal.classList.add('flex');
    newNoteModal.classList.add('visible');
    setTimeout(() => {
        newNoteTitle.focus();
    }, 100);
    document.body.style.overflow = 'hidden';
}

function hideNewNoteModal() {
    newNoteModal.classList.add('hidden');
    newNoteModal.classList.remove('flex');
    newNoteModal.classList.remove('visible');
    newNoteTitle.value = '';
    newNoteContent.value = '';
    document.body.style.overflow = '';
    updateNewNoteSaveButtonState();
}

function updateNewNoteSaveButtonState() {
    if (newNoteSaveBtn && newNoteTitle) {
        const hasTitle = newNoteTitle.value.trim().length > 0;
        newNoteSaveBtn.disabled = !hasTitle || !isDataLoaded;
    }
}

// --- Event Listeners Setup Function ---
function setupEventListeners() {
    console.log('Setting up event listeners...');

    // Add Note Button
    if (addNoteBtn) {
        console.log('Add note button found, adding event listener');
        addNoteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showNewNoteModal();
        });
    } else {
        console.error('Add note button not found!');
    }

    // New Note Modal Close Button
    if (newNoteCloseBtn) {
        newNoteCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideNewNoteModal();
        });
    }

    // New Note Save Button
    if (newNoteSaveBtn) {
        newNoteSaveBtn.addEventListener('click', (e) => {
            e.preventDefault();
            createNewNoteFromModal();
        });
    }

    // New Note Title Input - Update save button state
    if (newNoteTitle) {
        newNoteTitle.addEventListener('input', updateNewNoteSaveButtonState);
    }

    // Shortcuts Help Button
    if (shortcutsHelpBtn) {
        shortcutsHelpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            shortcutsPopup.classList.toggle('hidden');
        });
    }

    // Hide shortcuts popup when clicking outside
    document.addEventListener('click', (e) => {
        if (shortcutsPopup && !shortcutsPopup.contains(e.target) && !shortcutsHelpBtn.contains(e.target)) {
            shortcutsPopup.classList.add('hidden');
        }
    });

    // Chat Button
    if (chatBtn) {
        console.log('Chat button found, adding event listener');
        chatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('Chat button clicked');
            showChatModal();
        });
    } else {
        console.error('Chat button not found!');
    }

    // Chat Modal Close Button
    if (chatCloseBtn) {
        chatCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideChatModal();
        });
    }

    // Search Help Button
    if (searchHelpBtn) {
        searchHelpBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showSearchHelpModal();
        });
    }

    // Search Help Modal Close Button
    if (searchHelpCloseBtn) {
        searchHelpCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideSearchHelpModal();
        });
    }

    // Import/Sync Button
    if (importBtn) {
        importBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await checkForUpdates(true);
        });
    }

    // Modal Close Buttons
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideModal();
        });
    }

    if (mediaModalCloseBtn) {
        mediaModalCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideMediaModal();
        });
    }

    if (audioModalCloseBtn) {
        audioModalCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideAudioModal();
        });
    }

    if (wikipediaModalCloseBtn) {
        wikipediaModalCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            hideWikipediaModal();
        });
    }

    // Modal Delete Buttons
    if (modalDeleteBtn) {
        modalDeleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            deleteNote();
        });
    }

    if (mediaModalDeleteBtn) {
        mediaModalDeleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            deleteMediaNote();
        });
    }

    if (audioModalDeleteBtn) {
        audioModalDeleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            deleteAudioNote();
        });
    }

    if (wikipediaModalDeleteBtn) {
        wikipediaModalDeleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            deleteWikipediaNote();
        });
    }

    // Modal Edit Buttons
    if (modalEditBtn) {
        modalEditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleEditMode();
        });
    }

    if (wikipediaModalEditBtn) {
        wikipediaModalEditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleWikipediaEditMode();
        });
    }

    // Chat functionality
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sendChatMessage();
        });
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }

    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // N key for new note (when not in input fields)
        if (e.key === 'n' || e.key === 'N') {
            if (!e.target.matches('input, textarea, [contenteditable]') &&
                !noteModal.classList.contains('flex') &&
                !newNoteModal.classList.contains('visible') &&
                !chatModal.classList.contains('flex')) {
                e.preventDefault();
                showNewNoteModal();
            }
        }

        // Enter key to focus search
        if (e.key === 'Enter' && !e.target.matches('input, textarea, [contenteditable], button')) {
            e.preventDefault();
            searchInput.focus();
        }
    });

    // Table and code block event delegation
    document.addEventListener('click', (e) => {
        // Handle table actions
        if (e.target.closest('.table-action-btn')) {
            const btn = e.target.closest('.table-action-btn');
            const action = btn.dataset.action;
            const tableIndex = btn.dataset.tableIndex;
            const container = document.querySelector(`[data-table-index="${tableIndex}"]`);

            if (container) {
                const table = container.querySelector('table');
                if (action === 'copy' && table) {
                    copyTableAsMarkdown(table);
                } else if (action === 'download' && table) {
                    downloadTableAsCSV(table);
                }
            }
        }

        // Handle code block copy actions
        if (e.target.closest('.code-copy-btn')) {
            const btn = e.target.closest('.code-copy-btn');
            const codeIndex = btn.dataset.codeIndex;
            copyCodeToClipboard(codeIndex);
        }
    });
    // --- Missing Modal Functions ---

    function showChatModal() {
        console.log('showChatModal called');
        if (chatModal) {
            console.log('Chat modal found, showing it');
            chatModal.classList.remove('hidden');
            chatModal.classList.add('flex');
            if (chatInput) {
                chatInput.focus();
            }
            document.body.style.overflow = 'hidden';
        } else {
            console.error('Chat modal not found!');
        }
    }

    function hideChatModal() {
        chatModal.classList.add('hidden');
        chatModal.classList.remove('flex');
        document.body.style.overflow = '';
    }

    function showSearchHelpModal() {
        searchHelpModal.classList.remove('hidden');
        searchHelpModal.classList.add('flex');
        document.body.style.overflow = 'hidden';
    }

    function hideSearchHelpModal() {
        searchHelpModal.classList.add('hidden');
        searchHelpModal.classList.remove('flex');
        document.body.style.overflow = '';
    }

    function deleteMediaNote() {
        if (!currentMediaNoteInModal) return;

        if (window.confirm(`Are you sure you want to delete "${currentMediaNoteInModal.path}"?`)) {
            api.deleteNote(currentMediaNoteInModal.path).then(() => {
                updateNoteInState({ path: currentMediaNoteInModal.path }, 'delete');
                hideMediaModal();
            }).catch(error => {
                console.error(`Error deleting media note: ${currentMediaNoteInModal.path}`, error);
                alert("Failed to delete note. See console for details.");
            });
        }
    }

    function deleteAudioNote() {
        if (!currentAudioNoteInModal) return;

        if (window.confirm(`Are you sure you want to delete "${currentAudioNoteInModal.path}"?`)) {
            api.deleteNote(currentAudioNoteInModal.path).then(() => {
                updateNoteInState({ path: currentAudioNoteInModal.path }, 'delete');
                hideAudioModal();
            }).catch(error => {
                console.error(`Error deleting audio note: ${currentAudioNoteInModal.path}`, error);
                alert("Failed to delete note. See console for details.");
            });
        }
    }

    function deleteWikipediaNote() {
        if (!currentWikipediaNoteInModal) return;

        if (window.confirm(`Are you sure you want to delete "${currentWikipediaNoteInModal.path}"?`)) {
            api.deleteNote(currentWikipediaNoteInModal.path).then(() => {
                updateNoteInState({ path: currentWikipediaNoteInModal.path }, 'delete');
                hideWikipediaModal();
            }).catch(error => {
                console.error(`Error deleting Wikipedia note: ${currentWikipediaNoteInModal.path}`, error);
                alert("Failed to delete note. See console for details.");
            });
        }
    }

    function toggleEditMode() {
        // Implementation for standard note edit mode
        console.log('Toggle edit mode for standard note');
    }

    function toggleWikipediaEditMode() {
        // Implementation for Wikipedia note edit mode
        console.log('Toggle edit mode for Wikipedia note');
    }

    async function sendChatMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        // Add user message to chat
        addChatMessage('user', message);
        chatInput.value = '';

        // Add loading message
        const loadingId = addChatMessage('assistant', 'Thinking...');

        try {
            const response = await fetch(`/api/chat?question=${encodeURIComponent(message)}`);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            let assistantMessage = '';
            let sources = [];

            // Remove loading message
            removeChatMessage(loadingId);
            const assistantId = addChatMessage('assistant', '');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.token) {
                                assistantMessage += data.token;
                                updateChatMessage(assistantId, assistantMessage);
                            } else if (data.sources) {
                                sources = data.sources;
                            } else if (data.error) {
                                updateChatMessage(assistantId, `Error: ${data.error}`);
                            }
                        } catch (e) {
                            // Ignore parsing errors
                        }
                    }
                }
            }

            // Add sources if available
            if (sources.length > 0) {
                addChatSources(assistantId, sources);
            }

        } catch (error) {
            console.error('Chat error:', error);
            removeChatMessage(loadingId);
            addChatMessage('assistant', 'Sorry, I encountered an error processing your request.');
        }
    }

    function addChatMessage(role, content) {
        const messageId = `msg-${Date.now()}-${Math.random()}`;
        const messageDiv = document.createElement('div');
        messageDiv.id = messageId;
        messageDiv.className = `chat-message ${role}`;

        if (role === 'user') {
            messageDiv.innerHTML = `
            <div class="flex justify-end">
                <div class="bg-indigo-600 text-white rounded-lg px-4 py-2 max-w-xs lg:max-w-md">
                    ${content}
                </div>
            </div>
        `;
        } else {
            messageDiv.innerHTML = `
            <div class="flex justify-start">
                <div class="bg-gray-100 text-gray-800 rounded-lg px-4 py-2 max-w-xs lg:max-w-md">
                    <div class="message-content">${content}</div>
                </div>
            </div>
        `;
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return messageId;
    }

    function updateChatMessage(messageId, content) {
        const messageEl = document.getElementById(messageId);
        if (messageEl) {
            const contentEl = messageEl.querySelector('.message-content');
            if (contentEl) {
                contentEl.textContent = content;
            }
        }
    }

    function removeChatMessage(messageId) {
        const messageEl = document.getElementById(messageId);
        if (messageEl) {
            messageEl.remove();
        }
    }

    function addChatSources(messageId, sources) {
        const messageEl = document.getElementById(messageId);
        if (messageEl && sources.length > 0) {
            const sourcesDiv = document.createElement('div');
            sourcesDiv.className = 'mt-2 pt-2 border-t border-gray-200';
            sourcesDiv.innerHTML = `
            <div class="text-xs text-gray-500 mb-1">Sources:</div>
            ${sources.map(source => `
                <div class="text-xs text-indigo-600 cursor-pointer hover:underline" onclick="openNoteByPath('${source.path}')">
                    📄 ${source.path}
                </div>
            `).join('')}
        `;

            const contentDiv = messageEl.querySelector('.bg-gray-100');
            if (contentDiv) {
                contentDiv.appendChild(sourcesDiv);
            }
        }
    }

    function openNoteByPath(path) {
        const note = allNotes.find(n => n.path === path);
        if (note) {
            hideChatModal();
            if (note.isAudioNote) {
                showAudioModal(note);
            } else if (note.isMediaNote && note.media_type === 'wikipedia') {
                showWikipediaModal(note);
            } else if (note.isMediaNote && note.tmdb_data) {
                showMediaModal(note);
            } else {
                showStandardModal(note);
            }
        }
    }

    async function checkForUpdates(forceSync = false) {
        if (forceSync) {
            importBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span class="hidden lg:block ml-4">Syncing...</span>';
            lucide.createIcons();
        }

        try {
            await loadNotesFromServer();
            if (forceSync) {
                importBtn.innerHTML = '<i data-lucide="check" class="w-5 h-5"></i><span class="hidden lg:block ml-4">Synced!</span>';
                lucide.createIcons();

                setTimeout(() => {
                    importBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-5 h-5"></i><span class="hidden lg:block ml-4">Force Sync</span>';
                    lucide.createIcons();
                }, 2000);
            }
        } catch (error) {
            console.error('Error during sync:', error);
            if (forceSync) {
                importBtn.innerHTML = '<i data-lucide="x" class="w-5 h-5"></i><span class="hidden lg:block ml-4">Sync Failed</span>';
                lucide.createIcons();

                setTimeout(() => {
                    importBtn.innerHTML = '<i data-lucide="refresh-cw" class="w-5 h-5"></i><span class="hidden lg:block ml-4">Force Sync</span>';
                    lucide.createIcons();
                }, 2000);
            }
        }
    }

    function startRealtimeSync() {
        if (syncInterval) {
            clearInterval(syncInterval);
        }

        // Check for updates every 30 seconds
        syncInterval = setInterval(() => {
            checkForUpdates(false);
        }, 30000);
    }
}
// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing application...');
    initialize();
    setupEventListeners();
    console.log('Application initialization complete');
});
// No welcome messages - clean empty chat

// Simple clean chat functionality
document.addEventListener('DOMContentLoaded', () => {
    const chatBtn = document.getElementById('chat-btn');
    const chatModal = document.getElementById('chat-modal');
    const chatCloseBtn = document.getElementById('chat-close-btn');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');

    // Send message function
    function sendMessage() {
        if (!chatInput || !chatMessages) return;
        
        const message = chatInput.value.trim();
        if (!message) return;

        // Add user message
        const userMsg = document.createElement('div');
        userMsg.className = 'chat-message user';
        userMsg.innerHTML = `
            <div class="chat-avatar">
                <i data-lucide="user" class="w-5 h-5"></i>
            </div>
            <div class="chat-message-content">${message}</div>
        `;
        chatMessages.appendChild(userMsg);

        // Add AI response
        const aiMsg = document.createElement('div');
        aiMsg.className = 'chat-message';
        aiMsg.innerHTML = `
            <div class="chat-avatar">
                <i data-lucide="brain-circuit" class="w-5 h-5"></i>
            </div>
            <div class="chat-message-content">I received your message: "${message}"</div>
        `;
        chatMessages.appendChild(aiMsg);

        // Initialize icons
        lucide.createIcons({ nodes: [chatMessages] });
        
        // Clear input and scroll
        chatInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Open chat
    if (chatBtn && chatModal) {
        chatBtn.addEventListener('click', (e) => {
            e.preventDefault();
            chatModal.classList.remove('hidden');
            chatModal.classList.add('flex');
            document.body.style.overflow = 'hidden';
            
            // Clear messages and focus input
            if (chatMessages) chatMessages.innerHTML = '';
            if (chatInput) setTimeout(() => chatInput.focus(), 100);
        });
    }

    // Close chat
    if (chatCloseBtn && chatModal) {
        chatCloseBtn.addEventListener('click', (e) => {
            e.preventDefault();
            chatModal.classList.add('hidden');
            chatModal.classList.remove('flex');
            document.body.style.overflow = '';
        });
    }

    // Send button
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', (e) => {
            e.preventDefault();
            sendMessage();
        });
    }

    // Enter key
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }
});
// My Mind button - scroll to top functionality
setTimeout(() => {
    const myMindButton = document.getElementById('my-mind-btn');

    if (myMindButton) {
        console.log('Setting up my mind button listener');
        myMindButton.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('My mind button clicked - scrolling to top');

            // Scroll to top smoothly
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });

            // Also scroll the main content area to top if it exists
            const mainContent = document.querySelector('main .overflow-y-auto');
            if (mainContent) {
                mainContent.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            }
        });
    } else {
        console.error('My mind button not found');
    }
}, 100);