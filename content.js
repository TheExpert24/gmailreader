const SERVER_URL = "https://gmailreader1.onrender.com";

const statusCache = {};

function getEmailIdFromRow(row) {
    const subject = row.querySelector("span.bog")?.textContent?.trim();
    return subject || null;
}

async function checkStatus(id) {
    if (!id) return false;

    if (statusCache[id] !== undefined) return statusCache[id];

    try {
        const res = await fetch(`${SERVER_URL}/status?id=${encodeURIComponent(id)}`);
        const data = await res.json();
        statusCache[id] = !!data.opened;
        return statusCache[id];
    } catch {
        await new Promise(r => setTimeout(r, 1000));
        try {
            const res = await fetch(`${SERVER_URL}/status?id=${encodeURIComponent(id)}`);
            const data = await res.json();
            statusCache[id] = !!data.opened;
            return statusCache[id];
        } catch {
            return false;
        }
    }
}

function createBadge(isSeen) {
    const badge = document.createElement("span");

    badge.style.marginLeft = "6px";
    badge.style.display = "inline-block";
    badge.style.verticalAlign = "middle";
    badge.style.whiteSpace = "nowrap";
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

        const id = getEmailIdFromRow(row);
        if (!id) continue;

        const subjectEl = row.querySelector("span.bog");
        if (!subjectEl) continue;

        const isSeen = await checkStatus(id);
        subjectEl.appendChild(createBadge(isSeen));

        row.dataset.badgeAdded = "true";
    }
}

function injectPixel() {
    const body = document.querySelector('[aria-label="Message Body"]');
    if (!body || body.dataset.tracked) return;

    const subject = document.querySelector("h2")?.innerText?.trim();
    if (!subject) return;

    const id = subject;

    const img = document.createElement("img");
    img.src = `${SERVER_URL}/track?id=${encodeURIComponent(id)}&t=${Date.now()}`;
    img.style.width = "1px";
    img.style.height = "1px";
    img.style.opacity = "0";

    body.appendChild(img);
    body.dataset.tracked = "true";

    statusCache[id] = true;
}

const observer = new MutationObserver(() => {
    updateInbox();
    injectPixel();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

let lastUrl = location.href;

setInterval(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;

        document
            .querySelector('[aria-label="Message Body"]')
            ?.removeAttribute("data-tracked");

        injectPixel();
    }
}, 500);

// warm up render server
fetch(`${SERVER_URL}/status?id=warmup`).catch(() => {});

updateInbox();
