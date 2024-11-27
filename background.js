//for when the extension icon is clicked, a new note will spawn in the middle of the screen
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: "createNote" });
  });
  