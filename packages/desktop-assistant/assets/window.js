"use strict";
// These controls act on this local window only; the host validates both role and sender.
for (const button of document.querySelectorAll("[data-window-action]")) {
  button.addEventListener("click", () => {
    void window.assistant.windowAction(button.dataset.windowAction).catch(error => {
      const status=document.getElementById("status")??document.getElementById("tools-status");
      if(status)status.textContent=error.message;
    });
  });
}
document.querySelector(".assistant-window-header").addEventListener("dblclick", event => {
  if (!event.target.closest("button")) void window.assistant.windowAction("maximize").catch(()=>{});
});
