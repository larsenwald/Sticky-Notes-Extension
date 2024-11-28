console.log("Content script loaded successfully");

let notes = [];
let contextMenu = null;

// Load saved notes on page load
chrome.storage.local.get("stickyNotes", (data) => {
  notes = data.stickyNotes || [];
  loadNotesForCurrentUrl();
  createContextMenu();
});

// Listen for messages to create a new note
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "createNote") {
    createNote();
    sendResponse({ status: "Note created" });
  }
});

// Create a context menu
function createContextMenu() {
  contextMenu = document.createElement("div");
  contextMenu.className = "context-menu my-extension-hidden";
  
  const clearAllOption = document.createElement("div");
  clearAllOption.className = "context-menu-item";
  clearAllOption.textContent = "Clear All Notes";
  clearAllOption.addEventListener("click", () => {
    document.querySelectorAll(".sticky-note").forEach(note => note.remove());
    notes = [];
    saveNotes();
    hideContextMenu();
  });

  contextMenu.appendChild(clearAllOption);
  document.body.appendChild(contextMenu);

  // Close context menu when clicking outside
  document.addEventListener("click", (event) => {
    if (contextMenu && !contextMenu.contains(event.target)) {
      hideContextMenu();
    }
  });
}

// Show context menu
function showContextMenu(event) {
  event.preventDefault();
  
  // Hide any existing context menus
  hideContextMenu();

  // Position the context menu
  contextMenu.style.top = `${event.clientY}px`;
  contextMenu.style.left = `${event.clientX}px`;
  
  contextMenu.classList.remove("my-extension-hidden");
}

// Hide context menu
function hideContextMenu() {
  if (contextMenu) {
    contextMenu.classList.add("my-extension-hidden");
  }
}

// Create a new sticky note
function createNote(parentX = null, parentY = null) {
  const currentUrl = window.location.href;
  const viewportCenterX = window.scrollX + window.innerWidth / 2 - 100; // Center minus half width
  const viewportCenterY = window.scrollY + window.innerHeight / 2 - 75; // Center minus half height
  const offsetIncrement = 10;

  let spawnX = parentX !== null ? parentX + offsetIncrement : viewportCenterX;
  let spawnY = parentY !== null ? parentY + offsetIncrement : viewportCenterY;

  // Find an available position if no parent coordinates
  while (
    parentX === null &&
    notes.some(note => Math.abs(note.x - spawnX) < 5 && Math.abs(note.y - spawnY) < 5)
  ) {
    spawnX += offsetIncrement;
    spawnY += offsetIncrement;
  }

  const parentNote = notes.find(note => note.x === parentX && note.y === parentY);

  // If a parent note exists, inherit its size
  const width = parentNote ? parentNote.width : 200;
  const height = parentNote ? parentNote.height : 150;

  const note = {
    id: Date.now(),
    content: "",
    x: spawnX,
    y: spawnY,
    width,
    height,
    url: currentUrl,
  };

  notes.push(note);
  addNoteToPage(note);
  saveNotes();
}

// Add a sticky note to the page
function addNoteToPage(note) {
  const noteDiv = document.createElement("div");
  noteDiv.className = "sticky-note";
  Object.assign(noteDiv.style, {
    top: `${note.y}px`,
    left: `${note.x}px`,
    width: `${note.width}px`,
    height: `${note.height}px`,
  });

  // Header with buttons
  const header = document.createElement("div");
  header.className = "sticky-note-header";

  // Add button with emoji (first on the left)
  header.appendChild(createButton("➕", "add-btn", () => createNote(note.x, note.y)));

  // Grouped buttons for menu and trash (placed at the right)
  const rightButtons = document.createElement("div");
  rightButtons.className = "right-buttons";
  rightButtons.appendChild(createButton("🗑️", "trash-btn", () => deleteNote(note, noteDiv)));

  header.appendChild(rightButtons);

  // Textarea for note content
  const textarea = document.createElement("textarea");
  textarea.value = note.content;
  textarea.addEventListener("input", (e) => {
    note.content = e.target.value;
    saveNotes();
  });

  // Add right-click context menu
  noteDiv.addEventListener("contextmenu", showContextMenu);

  // Append elements and make draggable
  noteDiv.append(header, textarea);
  document.body.appendChild(noteDiv);
  disableDragForButtons(noteDiv);
  makeDraggable(noteDiv, note);

  // Handle resizing
  noteDiv.addEventListener("mouseup", () => {
    const rect = noteDiv.getBoundingClientRect();
    note.width = rect.width;
    note.height = rect.height;
    saveNotes();
  });
}

// Create a button with specified content and event listener
function createButton(content, className, onClick) {
  const button = document.createElement("button");
  button.className = className;
  button.textContent = content; // Use textContent to ensure emoji consistency
  button.addEventListener("click", onClick);
  return button;
}

// Delete a specific note
function deleteNote(note, noteDiv) {
  noteDiv.remove();
  notes = notes.filter(n => n.id !== note.id);
  saveNotes();
}

// Prevent button clicks from initiating drag
function disableDragForButtons(noteDiv) {
  noteDiv.querySelectorAll("button").forEach(button => {
    button.addEventListener("mousedown", (e) => e.stopPropagation());
  });
}

// Make a note draggable, restricted to the header
function makeDraggable(noteDiv, note) {
  const header = noteDiv.querySelector(".sticky-note-header");
  let offsetX, offsetY;

  header.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return; // Ignore button clicks
    offsetX = e.offsetX;
    offsetY = e.offsetY;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  });

  function onMouseMove(e) {
    noteDiv.style.left = `${e.pageX - offsetX}px`;
    noteDiv.style.top = `${e.pageY - offsetY}px`;
    note.x = e.pageX - offsetX;
    note.y = e.pageY - offsetY;
  }

  function onMouseUp() {
    saveNotes();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }
}

// Save notes to local storage
function saveNotes() {
  chrome.storage.local.set({ stickyNotes: notes });
}

// Load notes for the current URL
function loadNotesForCurrentUrl() {
  const currentUrl = window.location.href;
  document.querySelectorAll(".sticky-note").forEach(note => note.remove());
  notes.filter(note => note.url === currentUrl).forEach(addNoteToPage);
}

// Handle URL changes
window.addEventListener("hashchange", loadNotesForCurrentUrl);
