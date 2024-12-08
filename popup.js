// Get references to the buttons
const newNoteButton = document.getElementById("new-note");
const deleteAllButton = document.getElementById("delete-all");

// Set up the New Note button event listener
newNoteButton.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "createNote" });
    updateDeleteAllButton(); // Immediately check to see if the delete button should be enabled
    window.close(); // Close the popup after the button is clicked
  });
});

// Set up the Delete All button event listener
deleteAllButton.addEventListener("click", () => {
  const userConfirmed = confirm("Are you sure you want to delete all sticky notes?");
  if (userConfirmed) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { action: "deleteAllNotes" });
      updateDeleteAllButton(); // Immediately update button state after deletion
      window.close(); // Close the popup after the button is clicked
    });
  }
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
