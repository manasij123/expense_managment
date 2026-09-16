// Ported from static/script.js's window.shareReport
export async function shareNewspaperReport(year, month) {
  try {
    const response = await fetch(`/api/generate_share_link/newspaper/${year}/${month}`, { credentials: 'include' });
    const data = await response.json();

    if (navigator.share) {
      navigator.share({
        title: 'Newspaper Delivery Report',
        text: `Here is the Newspaper Delivery Report for ${month}/${year}`,
        url: data.link,
      }).catch((error) => console.log('Error sharing', error));
    } else if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(data.link).then(() => {
        alert('Secure dynamic link generated and copied to clipboard!');
      }).catch(() => prompt('Copy this link to share:', data.link));
    } else {
      prompt('Copy this link to share:', data.link);
    }
  } catch (error) {
    console.error('Error generating link:', error);
    alert('Failed to generate secure link. Please try again.');
  }
}
