const SERVER_URL = "https://gmailreader1.onrender.com";
function getEmailIdFromRow(row) {
    return (
        row.getAttribute("data-thread-id") ||
        row.getAttribute("data-legacy-thread-id") ||
        row.querySelector("span.bog")?.innerText ||
        null
    );
}

let lastUrl = location.href;

function injectPixelIfNeeded() {
    const body = document.querySelector('[aria-label="Message Body"]');

    if (!body) return;

    if (body.dataset.tracked === "true") return;

    const emailId = "email_" + Date.now(); // fallback unique id per open

    const img = document.createElement("img");
    img.src = `${SERVER_URL}/track?id=${emailId}`;
    img.style.width = "1px";
    img.style.height = "1px";
    img.style.display = "none";

    body.appendChild(img);
    body.dataset.tracked = "true";

    chrome.storage.local.set({ currentEmailId: emailId });

    console.log("Tracked open:", emailId);
}

async function checkStatus(id) {
    try {
        const res = await fetch(`${SERVER_URL}/status?id=${id}`);
        const data = await res.json();
        return data.opened;
    } catch {
        return false;
    }
}

function createBadge(isSeen) {
    const badge = document.createElement("span");
    badge.className = "gmail-read-badge";

    badge.style.marginLeft = "8px";
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.gap = "4px";
    badge.style.fontSize = "12px";

    badge.innerHTML = isSeen
        ? `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5"
                      stroke="#22c55e"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"/>
            </svg>
            <span style="color:#22c55e;">Read</span>
        `
        : `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9"
                        stroke="#9ca3af"
                        stroke-width="2"/>
            </svg>
            <span style="color:#9ca3af;">Not Read</span>
        `;

    return badge;
}

async function updateInbox() {
    const rows = document.querySelectorAll("tr.zA");

    for (const row of rows) {
        if (row.dataset.badgeAdded === "true") continue;

        const id = getEmailIdFromRow(row);
        if (!id) continue;

        const isSeen = await checkStatus(id);

        const title = row.querySelector("span.bog");
        if (!title) continue;

        const badge = createBadge(isSeen);

        // attach safely to row (Gmail doesn't wipe this as often)
        const container = row.querySelector("td.xY") || title;

        container.appendChild(badge);

        row.dataset.badgeAdded = "true";
    }
}

function watchGmail() {
    const observer = new MutationObserver(() => {
        updateInbox();
        injectPixelIfNeeded();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // URL watcher (Gmail navigation)
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;

            // reset tracking for new email view
            document.querySelector('[aria-label="Message Body"]')?.removeAttribute("data-tracked");

            injectPixelIfNeeded();
        }
    }, 500);
}

watchGmail();
updateInbox();
