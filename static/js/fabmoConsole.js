
  function toggleVisibility(id, wrapperId) {
    document.getElementById(id).addEventListener("change", function() {
      const section = document.getElementById(wrapperId);
      section.style.display = this.checked ? "block" : "none";
    });
  }

  toggleVisibility("toggle-updater", "updater-wrapper");
  toggleVisibility("toggle-fabmo", "fabmo-wrapper");
  toggleVisibility("toggle-status", "status-wrapper");
