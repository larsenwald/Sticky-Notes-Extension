// Get references to the buttons
const newNoteButton = document.getElementById("new-note");
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

// Set up the New Note button event listener
newNoteButton.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "createNote" });
    updateDeleteAllButton(); // Immediately check to see if the delete button should be enabled
    window.close(); // Close the popup after the button is clicked
  });
});

// Function to check if there are any notes and update the Delete All button state
function updateDeleteAllButton() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "checkNotes" }, (response) => {
      if (response && response.hasNotes) {
        deleteAllButton.disabled = false;
      } else {
        deleteAllButton.disabled = true;
      }
    });
  });
}

// Check for notes on the page initially when the popup is opened
updateDeleteAllButton();

// Listener for updates from the content script to dynamically adjust button states
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "notesUpdated") {
    updateDeleteAllButton();
  }
});

// Update the event listener to target the SVG icon instead
document.getElementById('manage-notes-icon').addEventListener('click', () => {
  chrome.tabs.create({ url: 'manage.html' });
});

// Add search functionality
searchInput.addEventListener('input', async () => {
  const searchTerm = searchInput.value.toLowerCase();
  const { stickyNotes } = await chrome.storage.local.get('stickyNotes');
  
  // Get current tab URL
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const currentUrl = tabs[0].url;
  
  // Filter notes for current page and search term
  const matchingNotes = (stickyNotes || [])
    .filter(note => note.url === currentUrl)
    .filter(note => note.content.toLowerCase().includes(searchTerm));

  // Display results
  searchResults.innerHTML = '';
  if (searchTerm) {
    if (matchingNotes.length === 0) {
      const noResults = document.createElement('div');
      noResults.textContent = 'No matching notes';
      noResults.className = 'no-results-message';
      searchResults.appendChild(noResults);
    } else {
      matchingNotes.forEach(note => {
        const preview = document.createElement('div');
        preview.className = 'note-preview';
        
        // Create preview text with highlighted search term
        const textContent = note.content.replace(/<[^>]*>/g, '');
        const previewText = highlightSearchTerm(textContent, searchTerm);
        preview.innerHTML = previewText;
        
        // Jump to note when clicked
        preview.addEventListener('click', () => {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: "jumpToNote", 
            noteId: note.id 
          });
          window.close(); // Close popup after jumping
        });
        
        searchResults.appendChild(preview);
      });
    }
  }
});

function highlightSearchTerm(text, searchTerm) {
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  return text.replace(regex, '<span class="highlight">$1</span>');
}
