class NotesManager {
  constructor() {
    this.sitesContainer = document.getElementById('sites-container');
    this.searchInput = document.getElementById('search-input');
    this.searchStats = document.getElementById('search-stats');
    this.currentSite = new URL(window.location.href).hostname;
    this.allNotes = [];
    
    this.setupEventListeners();
    this.loadNotes();
    this.setupRealtimeSync();
  }

  setupEventListeners() {
    this.searchInput.addEventListener('input', debounce(() => {
      this.handleSearch();
    }, 300));
  }

  async loadNotes() {
    const { stickyNotes } = await chrome.storage.local.get('stickyNotes');
    this.allNotes = stickyNotes || [];
    const siteMap = this.groupNotesBySite(this.allNotes);
    this.renderSites(siteMap);
  }

  async handleSearch() {
    const searchTerm = this.searchInput.value.toLowerCase();
    const searchScope = this.searchScope.value;
    
    let filteredNotes = this.allNotes;
    
    if (searchScope === 'current') {
      filteredNotes = this.allNotes.filter(note => {
        const noteHost = new URL(note.url).hostname;
        return noteHost === this.currentSite;
      });
    }

    if (searchTerm) {
      filteredNotes = filteredNotes.filter(note => {
        const content = note.content.toLowerCase();
        return content.includes(searchTerm);
      });

      this.searchStats.textContent = 
        `Found ${filteredNotes.length} note${filteredNotes.length !== 1 ? 's' : ''} ` +
        `containing "${searchTerm}"`;
    } else {
      this.searchStats.textContent = '';
    }

    const siteMap = this.groupNotesBySite(filteredNotes);
    this.renderSites(siteMap, searchTerm);
  }

  groupNotesBySite(notes) {
    return notes.reduce((acc, note) => {
      const url = new URL(note.url);
      const domain = url.hostname + url.pathname;
      if (!acc[domain]) acc[domain] = [];
      acc[domain].push(note);
      return acc;
    }, {});
  }

  renderSites(siteMap, searchTerm = '') {
    this.sitesContainer.innerHTML = '';
    
    Object.entries(siteMap).forEach(([site, notes]) => {
      const siteEl = document.createElement('div');
      siteEl.className = 'site-container';
      
      const header = document.createElement('div');
      header.className = 'site-header';
      
      header.innerHTML = `
        <div class="site-info">
          <a href="${notes[0].url}" class="site-link">${site}</a>
          <span class="note-count">${notes.length} note${notes.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="site-controls">
          <button class="toggle-notes">Show Notes</button>
          <button class="delete-site">Delete Site</button>
        </div>
      `;
      
      const notesGrid = document.createElement('div');
      notesGrid.className = 'notes-grid';
      notesGrid.style.display = 'none';
      
      const toggleBtn = header.querySelector('.toggle-notes');
      toggleBtn.addEventListener('click', () => {
        const isVisible = notesGrid.style.display !== 'none';
        notesGrid.style.display = isVisible ? 'none' : 'grid';
        toggleBtn.textContent = isVisible ? 'Show Notes' : 'Hide Notes';
      });
      
      const deleteBtn = header.querySelector('.delete-site');
      deleteBtn.addEventListener('click', () => this.deleteSite(site));
      
      notes.forEach(note => {
        const noteEl = this.createNotePreview(note, searchTerm);
        notesGrid.appendChild(noteEl);
      });
      
      siteEl.appendChild(header);
      siteEl.appendChild(notesGrid);
      this.sitesContainer.appendChild(siteEl);
    });
  }

  createNotePreview(note, searchTerm = '') {
    const container = document.createElement('div');
    container.className = 'note-preview-container';
    container.title = 'Click to go to this note';

    // Create preview of sticky note
    const noteEl = document.createElement('div');
    noteEl.className = 'sticky-note preview-only';
    noteEl.style.width = `${note.width}px`;
    noteEl.style.height = `${note.height}px`;
    noteEl.style.position = 'relative';
    noteEl.style.transform = 'scale(0.7)';
    noteEl.style.transformOrigin = 'top left';

    // Add header with explicit styling
    const header = document.createElement('div');
    header.className = 'sticky-header';
    header.style.cssText = `
      height: 24px;
      background-color: rgba(0, 0, 0, 0.05);
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 5px 5px 0 0;
      width: 100%;
      position: relative;
    `;
    
    // Create content area
    const content = document.createElement('div');
    content.className = 'note-textarea';
    content.innerHTML = searchTerm ? 
      this.highlightSearchTerm(note.content, searchTerm) : 
      note.content;
    content.style.pointerEvents = 'none';

    noteEl.appendChild(header);
    noteEl.appendChild(content);
    container.appendChild(noteEl);
    
    container.addEventListener('click', () => this.jumpToNote(note));
    
    return container;
  }

  highlightSearchTerm(content, searchTerm) {
    if (!searchTerm) return content;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return content.replace(regex, '<span class="highlight">$1</span>');
  }

  async deleteNote(noteId) {
    const { stickyNotes } = await chrome.storage.local.get('stickyNotes');
    const updatedNotes = stickyNotes.filter(note => note.id !== noteId);
    await chrome.storage.local.set({ stickyNotes: updatedNotes });
  }

  async deleteSite(site) {
    if (!confirm(`Delete all notes from ${site}?`)) return;
    
    const { stickyNotes } = await chrome.storage.local.get('stickyNotes');
    const updatedNotes = stickyNotes.filter(note => {
      const url = new URL(note.url);
      return (url.hostname + url.pathname) !== site;
    });
    await chrome.storage.local.set({ stickyNotes: updatedNotes });
  }

  async jumpToNote(note) {
    const tabs = await chrome.tabs.query({ url: note.url });
    if (tabs.length > 0) {
      // If tab exists, switch to it and scroll to note
      await chrome.tabs.update(tabs[0].id, { active: true });
      // Add small delay to ensure content script is ready
      setTimeout(() => {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: "jumpToNote",
          noteId: note.id
        });
      }, 100);
    } else {
      // If tab doesn't exist, create it and wait for content script to load
      const tab = await chrome.tabs.create({ url: note.url });
      chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
              action: "jumpToNote",
              noteId: note.id
            });
          }, 500); // Longer delay for new tab load
          chrome.tabs.onUpdated.removeListener(listener);
        }
      });
    }
  }

  setupRealtimeSync() {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.stickyNotes) {
        this.loadNotes();
      }
    });
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const manager = new NotesManager();
