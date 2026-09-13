import { handleMessage } from './worker.mjs';

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handleMessage(message, sender, chrome.runtime.id, event => {
    // Only projected progress reaches the originating frame; no raw Meta JSON.
    chrome.tabs.sendMessage(sender.tab.id, event, { frameId: 0 }).catch(() => {});
  }).then(respond).catch(() => respond(null));
  return true;
});
