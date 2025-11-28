// Replace existing toDirectDrive with this improved version
function toDirectDrive(url){
  try {
    if(!url) return '';

    url = url.toString().trim();

    // If it's already a data URI or looks like a direct host image, return as-is
    if (url.startsWith('data:')) return url;
    if (/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url)) return url;

    // If the token is a plain Drive file ID (no slashes, only allowed chars, length >= 8)
    // Accept IDs like: 1A2b3C4d5E6f7G8H9I0J or similar
    if (/^[A-Za-z0-9_-]{8,}$/.test(url)) {
      return `https://drive.google.com/uc?export=view&id=${url}`;
    }

    // file/d/FILEID pattern (viewer link)
    let m = url.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;

    // open?id=ID or &id=ID or thumbnail?id=ID
    m = url.match(/[?&]id=([A-Za-z0-9_-]+)/);
    if (m && m[1]) return `https://drive.google.com/uc?export=view&id=${m[1]}`;

    // googleusercontent direct image URLs (already direct)
    if (/googleusercontent\.com/i.test(url)) return url;

    // If url contains 'drive.google.com' but no ID matched, try last path segment as ID
    if (url.includes('drive.google.com')) {
      const parts = url.split('/').filter(Boolean);
      const last = parts.pop();
      if (last && /^[A-Za-z0-9_-]{8,}$/.test(last)) return `https://drive.google.com/uc?export=view&id=${last}`;
    }

    // Final fallback: return as-is
    return url;
  } catch (e) {
    return url;
  }
}