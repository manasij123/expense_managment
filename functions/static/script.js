function toggleModal(modalID) {
    const modal = document.getElementById(modalID);
    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    ['expenseModal', 'payModal', 'payAmountModal'].forEach((modalId) => {
        const modal = document.getElementById(modalId);
        if (modal && event.target == modal) {
            toggleModal(modalId);
        }
    });
}

// Live Clock Function
function updateClock() {
    const clockElement = document.getElementById('live-clock');
    if (clockElement) {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
        const ampm = hours >= 12 ? 'p.m.' : 'a.m.';
        
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        
        const timeString = hours.toString().padStart(2, '0') + ':' + minutes + ':' + seconds + ':' + milliseconds + ' ' + ampm;

        clockElement.textContent = timeString;

        requestAnimationFrame(updateClock);
    }
}

// Start the clock
updateClock();

// --- Theme Toggle ---
const themeToggleButton = document.getElementById('theme-toggle');
const body = document.body;

// Function to apply theme and update icon
const applyTheme = (theme) => {
    const sunIcon = themeToggleButton.querySelector('.fa-sun');
    const moonIcon = themeToggleButton.querySelector('.fa-moon');

    if (theme === 'dark') {
        body.classList.add('dark');
        sunIcon.classList.remove('hidden');
        moonIcon.classList.add('hidden');
    } else {
        body.classList.remove('dark');
        sunIcon.classList.add('hidden');
        moonIcon.classList.remove('hidden');
    }
};

// Check for saved theme in localStorage on page load and apply it
const savedTheme = localStorage.getItem('theme') || 'light'; // Default to light
applyTheme(savedTheme);

// Event listener for the toggle button
themeToggleButton.addEventListener('click', () => {
    const newTheme = body.classList.contains('dark') ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
});

// --- Tab Switching for History Page ---
function switchTab(tabName) {
    // Hide all content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
    });

    // Deactivate all buttons
    document.querySelectorAll('.tab-btn').forEach(button => {
        button.classList.remove('border-indigo-500', 'text-indigo-600', 'dark:text-indigo-400');
        button.classList.add('border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300', 'dark:text-slate-400', 'dark:hover:text-slate-300');
    });

    // Show selected content
    document.getElementById(`content-${tabName}`).classList.remove('hidden');

    // Activate selected button
    const activeButton = document.getElementById(`tab-${tabName}`);
    activeButton.classList.add('border-indigo-500', 'text-indigo-600', 'dark:text-indigo-400');
    activeButton.classList.remove('border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300', 'dark:text-slate-400', 'dark:hover:text-slate-300');
}

// --- History Page Search ---
document.addEventListener('DOMContentLoaded', () => {
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('search-input');
    const yearFilter = document.getElementById('year-filter');
    
    const monthlyContent = document.getElementById('content-monthly');
    const searchResultsContainer = document.getElementById('search-results-container');
    const searchResultsBody = document.getElementById('search-results-body');
    const noSearchResultsMessage = document.getElementById('no-search-results');
    const clearSearchBtn = document.getElementById('clear-search-btn');

    if (!searchForm) {
        return;
    }

    searchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const searchTerm = searchInput.value.trim();
        const selectedYear = yearFilter.value;

        if (!searchTerm) {
            return;
        }

        const response = await fetch(`/search_history?q=${encodeURIComponent(searchTerm)}&year=${selectedYear}`);
        const results = await response.json();

        monthlyContent.classList.add('hidden');
        searchResultsContainer.classList.remove('hidden');
        searchResultsBody.innerHTML = ''; // Clear previous results

        if (results.length === 0) {
            noSearchResultsMessage.classList.remove('hidden');
        } else {
            noSearchResultsMessage.classList.add('hidden');
            results.forEach(item => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-white/40 transition';

                const statusBadge = item.is_paid 
                    ? `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">Paid</span>`
                    : `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200">Unpaid</span>`;

                row.innerHTML = `
                    <td class="px-6 py-4 font-medium text-slate-800">${item.reason}</td>
                    <td class="px-6 py-4 text-right font-semibold text-slate-700">₹${item.amount}</td>
                    <td class="px-6 py-4">
                        <p class="font-bold text-slate-700 text-sm">${item.month_name}</p>
                        <p class="text-xs text-slate-400">${item.year}</p>
                    </td>
                    <td class="px-6 py-4 text-center">
                        <div class="flex flex-col items-center gap-1">
                            ${statusBadge}
                            ${item.paid_date ? `<span class="text-[10px] text-gray-500">${item.paid_date}</span>` : ''}
                        </div>
                    </td>
                `;
                searchResultsBody.appendChild(row);
            });
        }
    });

    clearSearchBtn.addEventListener('click', () => {
        searchResultsContainer.classList.add('hidden');
        monthlyContent.classList.remove('hidden');
        searchInput.value = '';
    });

    // Also clear search if the user starts typing again after a search
    searchInput.addEventListener('input', () => {
        if (searchResultsContainer.classList.contains('hidden') === false) {
            searchResultsContainer.classList.add('hidden');
            monthlyContent.classList.remove('hidden');
        }
    });
});

// --- Stagger Animation ---
document.addEventListener('DOMContentLoaded', () => {
    const staggerRows = document.querySelectorAll('.stagger-row');
    staggerRows.forEach(row => {
        const index = row.dataset.staggerIndex || 1;
        // Set animation-delay as an inline style
        row.style.animationDelay = `${(index * 0.05)}s`;
    });
});

// --- Full-screen Loader for Navigation ---
document.addEventListener('DOMContentLoaded', () => {
    const loaderLinks = document.querySelectorAll('.loader-link');
    const loaderContainer = document.getElementById('full-screen-loader');
    const lottiePlayer = document.getElementById('loader-animation');
    const loaderText = document.getElementById('loader-text');

    if (!loaderContainer || !lottiePlayer) {
        return;
    }

    loaderLinks.forEach(link => {
        link.addEventListener('click', function(event) {
            event.preventDefault();

            const url = this.href;
            const animationSrc = this.dataset.animation;
            const text = this.dataset.text || 'Loading...';

            // Set animation and text
            lottiePlayer.load(animationSrc);
            loaderText.textContent = text;

            // Show loader
            loaderContainer.classList.remove('hidden');
            loaderContainer.classList.add('flex');

            // Redirect after a delay
            setTimeout(() => {
                window.location.href = url;
            }, 2000); // 2-second delay
        });
    });
});

// Initialize Lucide Icons
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
});

// --- Share Report Function ---
window.shareReport = async function(event, userId, year, month) {
    if(event) {
        event.stopPropagation();
        event.preventDefault();
    }
    try {
        const response = await fetch(`/api/generate_share_link/newspaper/${year}/${month}`);
        const data = await response.json();
        
        if (navigator.share) {
            navigator.share({
                title: 'Newspaper Delivery Report',
                text: `Here is the Newspaper Delivery Report for ${month}/${year}`,
                url: data.link
            }).catch((error) => console.log('Error sharing', error));
        } else if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(data.link).then(() => {
                alert('Secure dynamic link generated and copied to clipboard!');
            }).catch(err => prompt('Copy this link to share:', data.link));
        } else {
            prompt('Copy this link to share:', data.link);
        }
    } catch (error) {
        console.error('Error generating link:', error);
        alert('Failed to generate secure link. Please try again.');
    }
};