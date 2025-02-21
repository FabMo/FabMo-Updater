
  // Get server IP dynamically from current window location
  var serverIP = window.location.hostname;

  // Function to fetch and update status data
  async function fetchStatusData() {
      try {
          let response = await fetch(`http://${serverIP}:80/status`);

          if (!response.ok) {
              throw new Error(`HTTP error! Status: ${response.status}`);
          }

          let data = await response.json(); // Expecting JSON response
          updateStatusConsole(data);
      } catch (error) {
          console.error("Failed to fetch status data:", error);
      }
  }

  // Fetch status every 500ms
  setInterval(fetchStatusData, 500);

  function updateStatusConsole(statusData) {
      var statusContainer = document.getElementById('status-content');

      if (!statusContainer) {
          console.error("Error: Status container not found!");
          return;
      }

      // Clear previous content to avoid duplication
      statusContainer.innerHTML = "";

      // Process JSON data and format it for display
      Object.entries(statusData).forEach(([key, value]) => {
          let statusEntry = document.createElement('div');
          statusEntry.style.whiteSpace = "pre-wrap"; // Ensure proper word wrapping
          statusEntry.style.margin = "2px 0"; // Adds spacing for readability
          statusEntry.innerHTML = `<strong>${key}:</strong> ${prettifyStatus(value)}`; // Prettify JSON output

          statusContainer.appendChild(statusEntry);
      });

      statusContainer.scrollTop = statusContainer.scrollHeight; // Auto-scroll if needed
  }

  function prettifyStatus(value) {
      if (typeof value === "object") {
          return JSON.stringify(value, null, 2); // Pretty-print objects
      }
      return value;
  }
