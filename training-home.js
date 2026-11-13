const previousCategoryLinks = new Set(['#cybersecurity', '#networks', '#systems-administration']);

function openBookmarkedCategory() {
  if (!previousCategoryLinks.has(location.hash)) return;
  const link = document.getElementById(location.hash.slice(1));
  if (link) location.replace(link.href);
}

openBookmarkedCategory();
window.addEventListener('hashchange', openBookmarkedCategory);
