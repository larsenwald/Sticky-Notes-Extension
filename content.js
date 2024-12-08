console.log("Content script loaded successfully");

let notes = [];
let formatMenu;
let isMouseDown = false;

// Load saved notes on page load
chrome.storage.local.get("stickyNotes", (data) => {
  notes = data.stickyNotes || [];
  loadNotesForCurrentUrl();
});

// Listen for messages to create a new note, delete all notes, or check if notes exist
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "createNote") {
    createNote();
    sendResponse({ status: "Note created" });
    notifyPopup();
  } else if (message.action === "deleteAllNotes") {
    deleteAllNotes();
    sendResponse({ status: "All notes deleted" });
    notifyPopup();
  } else if (message.action === "checkNotes") {
    const hasNotes = document.querySelectorAll(".sticky-note").length > 0;
    sendResponse({ hasNotes: hasNotes });
  }
});

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
  const height = parentNote ? parentNote.height : 190;

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
  notifyPopup(); // Notify popup of the updated notes state
}

// Add a sticky note to the page
function addNoteToPage(note) {
  const noteDiv = document.createElement("div");
  noteDiv.className = "sticky-note new-note-animation";
  Object.assign(noteDiv.style, {
    top: `${note.y}px`,
    left: `${note.x}px`,
    width: `${note.width}px`,
    height: `${note.height}px`,
    position: "absolute",
    zIndex: 9999,
  });

  // Remove animation class after it completes
  noteDiv.addEventListener("animationend", () => {
    noteDiv.classList.remove("new-note-animation");
  });

  const header = document.createElement("div");
  header.className = "sticky-note-header";

  header.appendChild(createButton("➕", "add-btn", () => createNote(note.x, note.y)));

  const rightButtons = document.createElement("div");
  rightButtons.className = "right-buttons";
  rightButtons.appendChild(
    createButton("🗑️", "trash-btn", () => {
      deleteNote(note, noteDiv);
      notifyPopup();
    })
  );

  header.appendChild(rightButtons);

  const textarea = document.createElement("div");
  textarea.className = "note-textarea";
  textarea.contentEditable = true;
  textarea.innerHTML = note.content;
  textarea.addEventListener("input", (e) => {
    note.content = e.target.innerHTML;
    saveNotes();
  });

  noteDiv.append(header, textarea);
  document.body.appendChild(noteDiv);
  disableDragForButtons(noteDiv);
  makeDraggable(noteDiv, note);

  noteDiv.addEventListener("mouseup", () => {
    const rect = noteDiv.getBoundingClientRect();
    note.width = rect.width;
    note.height = rect.height;
    saveNotes();
  });
}


// Show formatting menu
function showFormatMenu(selection, noteDiv) {
  if (!formatMenu) {
    formatMenu = document.createElement("div");
    formatMenu.className = "format-menu";
    formatMenu.style.position = "absolute";
    formatMenu.style.zIndex = 10000; // Ensure menu is above the sticky note

    // Create formatting buttons
    // Bold Button
    const boldButton = document.createElement("button");
    boldButton.textContent = "B";
    boldButton.addEventListener("mousedown", (e) => {
      e.preventDefault(); // Prevent losing focus
      e.stopPropagation();
    });
    boldButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.execCommand('bold', false, null);
    });

    // Italic Button
    const italicButton = document.createElement("button");
    italicButton.textContent = "I";
    italicButton.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    italicButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.execCommand('italic', false, null);
    });

    // Underline Button
    const underlineButton = document.createElement("button");
    underlineButton.textContent = "U";
    underlineButton.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    underlineButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.execCommand('underline', false, null);
    });

    // Font Size Increase Button
    const increaseFontButton = document.createElement("button");
    increaseFontButton.textContent = "A↑";
    increaseFontButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => adjustFontSize(1), 0); // Delay to ensure selection persists
    });

    // Font Size Decrease Button
    const decreaseFontButton = document.createElement("button");
    decreaseFontButton.textContent = "A↓";
    decreaseFontButton.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => adjustFontSize(-1), 0); // Delay to ensure selection persists
    });

    // Append buttons to the formatting menu
    formatMenu.appendChild(boldButton);
    formatMenu.appendChild(italicButton);
    formatMenu.appendChild(underlineButton);
    formatMenu.appendChild(increaseFontButton);
    formatMenu.appendChild(decreaseFontButton);

    document.body.appendChild(formatMenu);

    // Prevent events on the formatting menu from propagating
    formatMenu.addEventListener('mousedown', (e) => e.stopPropagation());
    formatMenu.addEventListener('mouseup', (e) => e.stopPropagation());
    formatMenu.addEventListener('click', (e) => e.stopPropagation());
  }

  // Ensure the menu is displayed to get its dimensions
  formatMenu.style.display = "block";

  // Get the range and its bounding rectangle
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  // Get the note's bounding rectangle
  const noteRect = noteDiv.getBoundingClientRect();

  // Determine if the selection rectangle is usable
  const isRectUsable = rect.width > 0 && rect.height > 0;

  let top, left;

  if (isRectUsable) {
    // Calculate the position relative to the sticky note
    const relativeTop = rect.top - noteRect.top + noteDiv.scrollTop;
    const relativeLeft = rect.left - noteRect.left + noteDiv.scrollLeft;

    const menuHeight = formatMenu.offsetHeight;
    const menuWidth = formatMenu.offsetWidth;

    // Increase the offset to position the menu higher
    const extraOffset = 10; // Increase this value if needed

    // Try to position above the selection, even if it overlaps the header
    top = noteRect.top + relativeTop - menuHeight - 8 - extraOffset; // 8px padding + extra offset
    left = noteRect.left + relativeLeft;

    // If top is less than the sticky note's top, allow overlapping the header
    // Ensure the menu doesn't go above the sticky note's top
    if (top < noteRect.top - extraOffset) {
      top = noteRect.top - extraOffset;
    }

    // Ensure the menu is within the sticky note's visible area horizontally
    const visibleLeft = noteRect.left;
    const visibleRight = noteRect.right - menuWidth;

    if (left < visibleLeft) left = visibleLeft + 8;
    if (left > visibleRight) left = visibleRight - 8;

  } else {
    // Position at default location within the sticky note (e.g., top-right corner)
    const noteTop = noteRect.top;
    const noteLeft = noteRect.left;
    const noteWidth = noteRect.width;

    top = noteTop + 10;
    left = noteLeft + noteWidth - formatMenu.offsetWidth - 10;
  }

  // Set the menu position
  formatMenu.style.top = `${top}px`;
  formatMenu.style.left = `${left}px`;
}

function adjustFontSize(change) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return; // Exit if no selection exists

  const range = selection.getRangeAt(0);

  // Save the current selection to reapply it later
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  // Check if the selection is within a single text node
  if (range.commonAncestorContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.commonAncestorContainer;

    // Split the text node into three parts: before, selected, and after
    const beforeText = textNode.textContent.slice(0, startOffset);
    const selectedText = textNode.textContent.slice(startOffset, endOffset);
    const afterText = textNode.textContent.slice(endOffset);

    // Create a new span for the selected text with the adjusted font size
    const span = document.createElement("span");
    const currentSize = parseFloat(window.getComputedStyle(textNode.parentElement).fontSize) || 16;
    const newSize = Math.max(8, Math.min(72, currentSize + change));
    span.style.fontSize = `${newSize}px`;
    span.textContent = selectedText;

    // Replace the original text node with the new nodes
    const parent = textNode.parentNode;
    parent.replaceChild(document.createTextNode(afterText), textNode);
    parent.insertBefore(span, parent.childNodes[startOffset]);
    parent.insertBefore(document.createTextNode(beforeText), span);

    // Restore the selection on the newly created span
    const newRange = document.createRange();
    newRange.setStart(span.firstChild, 0);
    newRange.setEnd(span.firstChild, selectedText.length);
    selection.removeAllRanges();
    selection.addRange(newRange);
  } else {
    // Handle complex selections (spanning multiple nodes)
    console.warn("Complex selections are not fully supported yet.");
  }

  saveNotes(); // Persist changes
}

function getSelectedTextNodes(range) {
  const nodes = [];
  function traverse(node) {
    if (node.nodeType === Node.TEXT_NODE && range.intersectsNode(node)) {
      nodes.push(node);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      node.childNodes.forEach(traverse);
    }
  }
  traverse(range.commonAncestorContainer);
  return nodes;
}

// Helper to retrieve font size, with a fallback
function getFontSize(element) {
  const computedStyle = window.getComputedStyle(element);
  return parseFloat(computedStyle.fontSize) || 16;
}

// Track mouse down and up events
document.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  // Hide the formatting menu when starting a new selection
  if (formatMenu) {
    formatMenu.style.display = 'none';
  }
});

document.addEventListener('mouseup', (e) => {
  isMouseDown = false;
  const selection = window.getSelection();

  // Check if the selection exists and contains text
  if (selection.rangeCount > 0 && selection.toString().length > 0) {
    const range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    let noteDiv = null;
    if (node.nodeType === Node.ELEMENT_NODE) {
      noteDiv = node.closest('.sticky-note');
    } else {
      noteDiv = node.parentElement ? node.parentElement.closest('.sticky-note') : null;
    }
    if (noteDiv) {
      showFormatMenu(selection, noteDiv);
      return;
    }
  }

  // If text was deleted or selection is collapsed, hide the formatting menu
  if (!selection.toString() || selection.isCollapsed) {
    if (formatMenu) {
      formatMenu.style.display = 'none';
    }
  }
});

// Handle selection changes
document.addEventListener('selectionchange', () => {
  setTimeout(() => {
    const selection = window.getSelection();
    if (!isMouseDown) {
      if (selection.rangeCount > 0 && selection.toString().length > 0) {
        const range = selection.getRangeAt(0);
        let node = range.commonAncestorContainer;
        let noteDiv = null;
        if (node.nodeType === Node.ELEMENT_NODE) {
          noteDiv = node.closest('.sticky-note');
        } else {
          noteDiv = node.parentElement ? node.parentElement.closest('.sticky-note') : null;
        }
        if (noteDiv) {
          showFormatMenu(selection, noteDiv);
          return;
        }
      }
      // Hide the formatting menu if no text is selected
      if (formatMenu) {
        formatMenu.style.display = 'none';
      }
    }
  }, 0); // Delay execution to ensure selection state is updated
});

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
  // Add bubble-popping animation class
  noteDiv.classList.add("delete-note-animation");

  // Remove the note after the animation completes
  noteDiv.addEventListener("animationend", () => {
    noteDiv.remove();
    notes = notes.filter(n => n.id !== note.id);
    saveNotes();
    notifyPopup();
  });
}

// Delete all sticky notes
function deleteAllNotes() {
  const allNotes = document.querySelectorAll(".sticky-note");

  allNotes.forEach(noteDiv => {
    noteDiv.classList.add("delete-note-animation");
    noteDiv.addEventListener("animationend", () => noteDiv.remove());
  });

  notes = [];
  saveNotes();
  notifyPopup();
}

// Notify the popup script of updates in note state
function notifyPopup() {
  chrome.runtime.sendMessage({ action: "notesUpdated" });
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
  let isDragging = false;

  header.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON") return; // Ignore button clicks
    offsetX = e.offsetX;
    offsetY = e.offsetY;
    isDragging = true;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    noteDiv.style.left = `${e.pageX - offsetX}px`;
    noteDiv.style.top = `${e.pageY - offsetY}px`;
    note.x = e.pageX - offsetX;
    note.y = e.pageY - offsetY;
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    saveNotes();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  // Ensure dragging stops if the mouse leaves the document
  document.addEventListener("mouseleave", () => {
    if (isDragging) {
      isDragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
  });
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
