async function fetchEngineVersionsFromGitHub() {
    // You can adjust this URL to point to your actual engine repo.
    const url = 'https://api.github.com/repos/FabMo/FabMo-Engine/releases';
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch releases: ${response.status}`);
      }
      const releases = await response.json();
  
      // releases is an array of GitHub release objects
      // Each release object typically has a "tag_name" you can use.
      const select = document.getElementById('version-select');
      
      // Clear old options first, if any
      select.innerHTML = '<option value="">(Select a version)</option>';
  
      releases.forEach(release => {
        const option = document.createElement('option');
        option.value = release.tag_name;       // e.g. "v1.7.5"
        option.textContent = release.tag_name; // Display the same tag name
        select.appendChild(option);
      });
  
      // Enable the dropdown / button now that we have versions
      select.disabled = false;
      document.getElementById('btn-install-version').classList.remove('disabled');
      
    } catch (error) {
      console.error("Error fetching versions:", error);
    }
  }
  