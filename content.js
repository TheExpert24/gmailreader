const SERVER_URL = "https://gmailreader1.onrender.com";

let currentEmailId = null;
function injectPixel() {
    const body = document.querySelector('[aria-label="Message Body"]');

    if (!body || body.dataset.tracked) return;

    currentEmailId = "email_" + Date.now();

    const img = document.createElement("img");
    img.src = `${SERVER_URL}/track?id=${currentEmailId}`;
    img.style.width = "1px";
    img.style.height = "1px";
    img.style.display = "none";

    body.appendChild(img);
    body.dataset.tracked = "true";

    chrome.storage.local.set({ currentEmailId });

    console.log("Tracking ID:", currentEmailId);
}
async function checkStatus(id) {
    try {
        const res = await fetch(`${SERVER_URL}/status?id=${id}`);
        const data = await res.json();
        return data.opened;
    } catch (e) {
        return false;
    }
}

function createBadge(isSeen) {
    const badge = document.createElement("span");
    badge.style.marginLeft = "8px";
    badge.style.display = "inline-flex";
    badge.style.alignItems = "center";
    badge.style.gap = "4px";
    badge.style.fontSize = "12px";

    if (isSeen) {
        badge.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5"
                      stroke="#22c55e"
                      stroke-width="2.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"/>
            </svg>
            <span style="color:#22c55e;">Seen</span>
        `;
    } else {
        badge.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9"
                        stroke="#9ca3af"
                        stroke-width="2"/>
            </svg>
            <span style="color:#9ca3af;">Not seen</span>
        `;
    }

    return badge;
}

async function updateInbox() {
    const rows = document.querySelectorAll("tr.zA");

    const stored = await chrome.storage.local.get("currentEmailId");
    const id = stored.currentEmailId;

    if (!id) return;

    const isSeen = await checkStatus(id);

    rows.forEach((row) => {
        if (row.dataset.badgeAdded) return;

        const title = row.querySelector("span.bog");

        if (title) {
            const badge = createBadge(isSeen);
            title.appendChild(badge);
        }

        row.dataset.badgeAdded = "true";
    });
}
setInterval(() => {
    injectPixel();
    updateInbox();
}, 3000);
