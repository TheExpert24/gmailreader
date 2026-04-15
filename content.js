const SERVER_URL = "https://gmailreader1.onrender.com";

const statusCache = {};

function getEmailId(row) {
    const subject = row.querySelector("span.bog")?.textContent?.trim();
    const sender = row.querySelector(".yW span")?.textContent?.trim();

    if (!subject) return null;

    return `${sender || "unknown"}::${subject}`;
}

async function checkStatus(id) {
    if (statusCache[id] !== undefined) return statusCache[id];

    try {
        const res = await fetch(`${SERVER_URL}/status?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        statusCache[id] = !!data.opened;
        return statusCache[id];
    } catch {
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

    badge.innerHTML = isSeen
        ? `✔ <span style="color:#22c55e;">Read</span>`
        : `○ <span style="color:#9ca3af;">Not Read</span>`;

    return badge;
}

async function updateInbox() {
    const rows = document.querySelectorAll("tr.zA");

    for (const row of rows) {
        if (row.dataset.badgeAdded) continue;

        const id = getEmailId(row);
        if (!id) continue;

        const isSeen = await checkStatus(id);

        const container = row.querySelector("td.xY");
        if (!container) continue;

        container.appendChild(createBadge(isSeen));

        row.dataset.badgeAdded = "true";
    }
}

let scheduled = false;

function schedule() {
    if (scheduled) return;
    scheduled = true;

    setTimeout(() => {
        updateInbox();
        scheduled = false;
    }, 800);
}

const observer = new MutationObserver(schedule);

observer.observe(document.body, {
    childList: true,
    subtree: true
});

updateInbox();
